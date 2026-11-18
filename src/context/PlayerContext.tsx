/*
 * Player state + orchestration. All media handling lives in the engines (src/playback/engines);
 * queue rules live in src/playback/queue.ts. This provider wires them together and exposes an API to the UI.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ProviderId, RepeatMode, Track } from '../types';
import type { EngineEvents, PlaybackEngine } from '../playback/engines/types';
import { DemoEngine } from '../playback/engines/demoEngine';
import { HtmlAudioEngine } from '../playback/engines/htmlAudioEngine';
import { YouTubeEngine } from '../playback/engines/youtubeEngine';
import * as Q from '../playback/queue';
import { SPEEDS, effectiveSpeed, formatSpeed, supportedSpeeds } from '../playback/speeds';
import { loadPlayerSnapshot, savePlayerSnapshot } from '../playback/persistence';
import { useLibrary } from './LibraryContext';
import { ensurePlaybackSession } from '../playback/audioSession';
import { diag } from '../diag/audioDiag';
import { useToast } from './ToastContext';
import { useListeningStore } from '../recommend/ListeningStore';
import type { EndReason } from '../recommend/listening';
import { PASTED_CHANNEL } from '../services/youtube';

export type SleepTimer = { kind: 'time'; minutes: number; endsAt: number } | { kind: 'track' } | null;

export interface PlayerApi {
  track: Track | null;
  queue: Track[];
  index: number;
  isPlaying: boolean;
  buffering: boolean;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  /** user's preferred speed (persisted) */
  rate: number;
  /** speed actually applied to the current provider */
  effectiveRate: number;
  /** speeds the current provider supports */
  speeds: number[];
  sleepTimer: SleepTimer;
  failedIds: ReadonlySet<string>;
  /** the last track ended and the queue had nothing playable after it (Smart Autoplay resumes from here) */
  stalledAtEnd: boolean;
  /** queue items added automatically (Smart Autoplay / Radio) → why they were picked */
  autoReasons: ReadonlyMap<string, string>;
  /** playback was prevented by the browser's autoplay policy; a tap resumes */
  autoplayBlocked: boolean;
  hasRealAudio: boolean;
  ytHostRef: (el: HTMLDivElement | null) => void;
  getAnalyser(): AnalyserNode | null;
  isPlayable(t: Track): boolean;
  playTrack(t: Track, list?: Track[]): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  next(): void;
  prev(): void;
  seek(seconds: number): void;
  setVolume(v: number): void;
  changeVolume(delta: number): void;
  toggleMute(): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  setRate(r: number): void;
  setSleepTimer(minutes: number | 'track' | null): void;
  addToQueue(t: Track): void;
  /** append recommendations after the user's queue (deduplicated); returns how many were added */
  appendRecommendations(picks: { track: Track; reason: string }[]): number;
  removeUpcomingRecommendations(): void;
  playNext(t: Track): void;
  removeFromQueue(id: string): void;
  moveInQueue(from: number, to: number): void;
  clearQueue(): void;
  jumpTo(i: number): void;
  stop(): void;
}

export interface PlayerTime {
  currentTime: number;
  duration: number;
  /** ms until the sleep timer fires (time-based timers only) */
  sleepRemaining: number | null;
}

const PlayerCtx = createContext<PlayerApi | null>(null);
const TimeCtx = createContext<PlayerTime>({ currentTime: 0, duration: 0, sleepRemaining: null });

const ALL = [...SPEEDS] as number[];
const defaultRates = (t: Track | null): number[] => (!t ? ALL : t.provider === 'youtube' && t.isLive ? [1] : ALL);

/** Lock Screen artwork: several sizes for YouTube videos, the stored thumbnail otherwise. */
function artworkFor(t: Track): MediaImage[] {
  if (t.videoId) {
    return [
      { src: `https://i.ytimg.com/vi/${t.videoId}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' },
      { src: `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
      { src: `https://i.ytimg.com/vi/${t.videoId}/sddefault.jpg`, sizes: '640x480', type: 'image/jpeg' },
    ];
  }
  return t.thumbnail ? [{ src: t.thumbnail, sizes: '320x180', type: 'image/jpeg' }] : [];
}

const carMode = () => document.documentElement.classList.contains('mode-car');

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { pushHistory, settings } = useLibrary();
  const { recordListen } = useListeningStore();
  const toast = useToast();

  const initial = useRef(loadPlayerSnapshot(localStorage)).current;
  const [queue, setQueueState] = useState<Q.QueueState>({ items: initial.queue, index: initial.index });
  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(initial.position);
  const [duration, setDuration] = useState(initial.queue[initial.index]?.duration ?? 0);
  const [volume, setVolumeState] = useState(initial.volume);
  const [muted, setMuted] = useState(initial.muted);
  const [shuffle, setShuffle] = useState(initial.shuffle);
  const [repeat, setRepeat] = useState<RepeatMode>(initial.repeat);
  const [rate, setRateState] = useState(initial.rate);
  const [providerRates, setProviderRates] = useState<number[]>(defaultRates(initial.queue[initial.index] ?? null));
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const [sleepTimer, setSleep] = useState<SleepTimer>(null);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  const [autoReasons, setAutoReasons] = useState<ReadonlyMap<string, string>>(new Map());
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [stalledAtEnd, setStalledAtEnd] = useState(false);
  const autoRef = useRef(autoReasons);
  autoRef.current = autoReasons;

  const track = Q.currentOf(queue);
  const speeds = useMemo(() => supportedSpeeds(providerRates), [providerRates]);
  const effectiveRate = effectiveSpeed(rate, speeds);

  // ---- live refs for engine callbacks / timers -------------------------------------------
  const live = useRef({ queue, track, isPlaying, currentTime, duration, volume, muted, shuffle, repeat, effectiveRate, failed, sleepTimer, settings });
  live.current = { queue, track, isPlaying, currentTime, duration, volume, muted, shuffle, repeat, effectiveRate, failed, sleepTimer, settings };
  const loadedId = useRef<string | null>(null);
  const activeEngine = useRef<ProviderId | null>(null);
  const shufflePlayed = useRef(new Set<string>());
  const errorStreak = useRef(0);
  const ytHost = useRef<HTMLDivElement | null>(null);
  const slowToastFor = useRef<string | null>(null);
  const handlers = useRef<{ ended(): void; error(msg: string): void }>({ ended() {}, error() {} });

  // ---- listening sessions (feed the recommendation engine) ---------------------------
  // A session measures time actually spent playing and the furthest position reached,
  // so a track that was only selected or skipped isn't mistaken for a preference.
  const session = useRef<{ track: Track; at: number; acc: number; since: number | null; maxPos: number } | null>(null);
  const endReason = useRef<EndReason>('switched');
  const finalizeListen = useCallback((reason: EndReason) => {
    const s = session.current;
    if (!s) return;
    session.current = null;
    const acc = s.acc + (s.since ? Date.now() - s.since : 0);
    const listenedSec = Math.round(acc / 100) / 10;
    if (listenedSec < 1) return;
    const durationSec = s.track.duration || live.current.duration || 0;
    recordListen({
      id: `${s.track.id}:${s.at}`, trackId: s.track.id, track: s.track, at: s.at, listenedSec, durationSec,
      completion: durationSec ? Math.min(1, Math.max(s.maxPos, reason === 'ended' ? durationSec : 0) / durationSec) : 0, reason,
    });
  }, [recordListen]);
  const startSession = (t: Track, startAt: number) => {
    session.current = { track: t, at: Date.now(), acc: 0, since: null, maxPos: startAt };
  };

  // ---- engines ---------------------------------------------------------------------------
  const engines = useRef<Record<ProviderId, PlaybackEngine> | null>(null);
  if (!engines.current) {
    const make = (id: ProviderId): EngineEvents => {
      const active = () => activeEngine.current === id;
      return {
        onPlay: () => {
          if (!active()) return;
          diag('engine.play', { provider: id });
          errorStreak.current = 0;
          setIsPlaying(true);
          setBuffering(false);
          setAutoplayBlocked(false);
        },
        onPause: () => {
          if (!active()) return;
          diag('engine.pause', { provider: id });
          setIsPlaying(false);
        },
        onEnded: () => active() && handlers.current.ended(),
        onError: (msg) => active() && handlers.current.error(msg),
        onBuffering: (b) => active() && setBuffering(b),
        onDuration: (d) => active() && d > 0 && Number.isFinite(d) && setDuration(d),
        onRates: (r) => active() && setProviderRates(r.length ? r : [1]),
        onBlocked: () => {
          if (!active()) return;
          diag('engine.blocked', { provider: id });
          setIsPlaying(false);
          setBuffering(false);
          setAutoplayBlocked(true);
        },
        onSlow: () => {
          if (!active() || slowToastFor.current === loadedId.current) return;
          slowToastFor.current = loadedId.current;
          toast('Mạng chậm — đang tải bài, vui lòng chờ…', { duration: 3500 });
        },
        onMeta: (m) => {
          if (!active() || !m.title) return;
          setQueueState((q) => ({
            ...q,
            items: q.items.map((t) => (t.videoId === m.videoId && t.channel === PASTED_CHANNEL ? { ...t, title: m.title!, channel: m.channel || 'YouTube' } : t)),
          }));
        },
      };
    };
    engines.current = {
      youtube: new YouTubeEngine(make('youtube'), () => ytHost.current),
      demo: new DemoEngine(make('demo')),
      local: new HtmlAudioEngine(make('local')),
    };
  }
  const engineFor = (p: ProviderId) => engines.current![p];
  const activeEngineObj = () => (activeEngine.current ? engineFor(activeEngine.current) : null);

  const isPlayable = useCallback(
    (t: Track) => !t.unavailable && !failed.has(t.id) && !(t.provider === 'local' && !t.src),
    [failed],
  );
  const isPlayableLive = (t: Track) => !t.unavailable && !live.current.failed.has(t.id) && !(t.provider === 'local' && !t.src);

  // ---- core loading ----------------------------------------------------------------------
  const loadQueue = useCallback(
    (q: Q.QueueState, opts: { autoplay: boolean; startAt?: number } = { autoplay: true }) => {
      const t = Q.currentOf(q);
      setQueueState(q);
      live.current.queue = q;
      if (!t) return;
      setStalledAtEnd(false);
      finalizeListen(endReason.current);
      endReason.current = 'switched';
      const engine = engineFor(t.provider);
      if (opts.autoplay) ensurePlaybackSession('load track');
      diag('player.load', { provider: t.provider, autoplay: opts.autoplay });
      if (activeEngine.current && activeEngine.current !== t.provider) engineFor(activeEngine.current).stop();
      activeEngine.current = t.provider;
      loadedId.current = t.id;
      const startAt = opts.startAt ?? 0;
      setCurrentTime(startAt);
      setDuration(t.duration);
      setProviderRates(defaultRates(t));
      setBuffering(true);
      if (opts.autoplay) setIsPlaying(true);
      const { volume: v, muted: m, effectiveRate: r } = live.current;
      engine.load(t, { autoplay: opts.autoplay, startAt, rate: effectiveSpeed(r, supportedSpeeds(defaultRates(t))), volume: v, muted: m });
      if (opts.autoplay) {
        shufflePlayed.current.add(t.id);
        pushHistory(t);
        startSession(t, startAt);
      }
    },

    [pushHistory],
  );

  const pause = useCallback(() => {
    diag('player.pause');
    activeEngineObj()?.pause();
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    const { track: t, queue: q, currentTime: ct } = live.current;
    if (!t) return;
    if (!isPlayableLive(t)) {
      const pick = Q.pickNext(q, { shuffle: false, repeat: 'all', auto: false, isPlayable: isPlayableLive });
      if (pick) loadQueue({ ...q, index: pick.index });
      return;
    }
    // restored from a previous session (or stopped): load first, resuming where we left off
    if (loadedId.current !== t.id) return loadQueue(q, { autoplay: true, startAt: ct });
    if (!session.current) startSession(t, ct);
    setAutoplayBlocked(false);
    ensurePlaybackSession('play');
    diag('player.play', { provider: t.provider, at: Math.round(ct) });
    activeEngineObj()?.play();
    setIsPlaying(true);
  }, [loadQueue]);

  const togglePlay = useCallback(() => (live.current.isPlaying ? pause() : play()), [play, pause]);

  const seek = useCallback((s: number) => {
    const t = live.current.track;
    if (!t) return;
    const time = Math.max(0, s);
    if (loadedId.current === t.id) activeEngineObj()?.seek(time);
    setCurrentTime(time);
  }, []);

  /** Move to the next track. `auto` = track ended / failed by itself. */
  const advance = useCallback(
    (auto: boolean) => {
      const { queue: q, shuffle: sh, repeat: rp } = live.current;
      const pick = Q.pickNext(q, { shuffle: sh, repeat: rp, auto, isPlayable: isPlayableLive, played: shufflePlayed.current });
      if (!pick) {
        if (auto) {
          finalizeListen('ended');
          setIsPlaying(false);
          activeEngineObj()?.pause();
          setStalledAtEnd(true);
        }
        return false;
      }
      if (pick.cycleReset) shufflePlayed.current.clear();
      loadQueue({ ...q, index: pick.index });
      return true;
    },
    [loadQueue],
  );

  const next = useCallback(() => {
    endReason.current = 'skipped';
    if (!advance(false)) toast('Hàng đợi không còn bài nào để phát', { duration: 2000 });
  }, [advance, toast]);

  const prev = useCallback(() => {
    const { queue: q, currentTime: ct } = live.current;
    if (!q.items.length) return;
    if (ct > 3) return seek(0);
    const i = Q.pickPrev(q, isPlayableLive);
    if (i === null) return seek(0);
    loadQueue({ ...q, index: i });
  }, [seek, loadQueue]);

  handlers.current.ended = () => {
    const { repeat: rp, settings: st, sleepTimer: sleep } = live.current;
    endReason.current = 'ended';
    if (sleep?.kind === 'track') {
      finalizeListen('ended');
      setSleep(null);
      setIsPlaying(false);
      toast('Hẹn giờ tắt: đã tạm dừng khi hết bài', { duration: 5000 });
      return;
    }
    if (rp === 'one') {
      finalizeListen('ended');
      if (live.current.track) startSession(live.current.track, 0);
      seek(0);
      activeEngineObj()?.play();
      return;
    }
    if (!st.autoplay && rp !== 'all') {
      finalizeListen('ended');
      setIsPlaying(false);
      return;
    }
    advance(true);
  };

  handlers.current.error = (msg) => {
    const t = live.current.track;
    setBuffering(false);
    setIsPlaying(false);
    if (!t) return;
    session.current = null; // a failed track isn't a listen or a skip
    endReason.current = 'stopped';
    const nextFailed = new Set(live.current.failed).add(t.id);
    live.current.failed = nextFailed;
    setFailed(nextFailed);
    errorStreak.current += 1;
    if (errorStreak.current > Math.max(3, live.current.queue.items.length)) {
      toast(`${msg} Hàng đợi không còn bài nào phát được.`, { type: 'warning', duration: 5000 });
      return;
    }
    const hasNext = Q.pickNext(live.current.queue, { shuffle: false, repeat: 'all', auto: false, isPlayable: isPlayableLive });
    toast(hasNext ? `${msg} Đang chuyển sang bài tiếp theo…` : msg, { type: 'warning', duration: 4200 });
    if (hasNext) setTimeout(() => advance(true) || advance(false), 500);
  };

  // ---- volume / modes / speed ------------------------------------------------------------
  const setVolume = useCallback((v: number) => {
    const vol = Math.max(0, Math.min(100, Math.round(v)));
    setVolumeState(vol);
    setMuted(vol === 0);
    activeEngineObj()?.setVolume(vol, vol === 0);
  }, []);

  const changeVolume = useCallback((delta: number) => {
    const { volume: v, muted: m } = live.current;
    setVolume((m ? 0 : v) + delta);
  }, [setVolume]);

  const toggleMute = useCallback(() => {
    const { volume: v, muted: m } = live.current;
    const nm = !m;
    const vol = !nm && v === 0 ? 50 : v;
    setMuted(nm);
    setVolumeState(vol);
    activeEngineObj()?.setVolume(vol, nm);
  }, []);

  const setRate = useCallback((r: number) => setRateState(r), []);

  useEffect(() => {
    if (loadedId.current) activeEngineObj()?.setRate(effectiveRate);
  }, [effectiveRate]);

  const toggleShuffle = useCallback(() => {
    shufflePlayed.current = new Set(live.current.track ? [live.current.track.id] : []);
    setShuffle((s) => !s);
  }, []);
  const cycleRepeat = useCallback(() => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')), []);

  // ---- queue -----------------------------------------------------------------------------
  const playTrack = useCallback(
    (t: Track, list?: Track[]) => {
      if (live.current.track?.id === t.id) return togglePlay();
      // an explicit click retries tracks that failed before
      if (live.current.failed.has(t.id)) setFailed((f) => { const n = new Set(f); n.delete(t.id); live.current.failed = n; return n; });
      errorStreak.current = 0;
      autoRef.current = new Map();
      setAutoReasons(autoRef.current); // a new list replaces any previous recommendations
      loadQueue(Q.fromList(list && list.length ? list : [t], t.id));
    },
    [togglePlay, loadQueue],
  );

  const addToQueue = useCallback(
    (t: Track) => {
      if (!live.current.track) return loadQueue(Q.fromList([t], t.id));
      setQueueState((q) => Q.appendManual(q, t, (id) => autoRef.current.has(id)));
      unmarkAuto(t.id);
      toast('Đã thêm vào hàng đợi', { type: 'success', duration: 1800 });
    },
    [loadQueue, toast],
  );

  const playNext = useCallback(
    (t: Track) => {
      if (!live.current.track) return loadQueue(Q.fromList([t], t.id));
      if (live.current.track.id === t.id) return;
      setQueueState((q) => Q.insertNext(q, t));
      unmarkAuto(t.id);
      toast('Sẽ phát tiếp theo', { type: 'success', duration: 1800 });
    },
    [loadQueue, toast],
  );

  const unmarkAuto = (id: string) => {
    if (!autoRef.current.has(id)) return;
    const m = new Map(autoRef.current);
    m.delete(id);
    autoRef.current = m;
    setAutoReasons(m);
  };

  const appendRecommendations = useCallback((picks: { track: Track; reason: string }[]) => {
    const q = live.current.queue;
    const res = Q.appendAuto(q, picks.map((p) => p.track).filter((t) => !live.current.failed.has(t.id)));
    const { added } = res;
    if (!added.length) return 0;
    const state = Q.trimPlayed(res.state); // long autoplay sessions: keep the queue (and saved state) bounded
    live.current.queue = state;
    setQueueState(state);
    const m = new Map(autoRef.current);
    for (const p of picks) if (added.some((t) => t.id === p.track.id)) m.set(p.track.id, p.reason);
    autoRef.current = m;
    setAutoReasons(m);
    return added.length;
  }, []);

  const removeUpcomingRecommendations = useCallback(() => {
    const q = Q.removeUpcoming(live.current.queue, (t) => autoRef.current.has(t.id));
    live.current.queue = q;
    setQueueState(q);
  }, []);

  const removeFromQueue = useCallback((id: string) => setQueueState((q) => Q.remove(q, id)), []);
  const moveInQueue = useCallback((from: number, to: number) => setQueueState((q) => Q.move(q, from, to)), []);
  const clearQueue = useCallback(() => {
    setQueueState((q) => Q.clear(q));
    toast('Đã xóa hàng đợi', { duration: 1800 });
  }, [toast]);
  const jumpTo = useCallback((i: number) => {
    const q = live.current.queue;
    if (!q.items[i]) return;
    if (i === q.index) return togglePlay();
    loadQueue({ ...q, index: i });
  }, [loadQueue, togglePlay]);

  const stop = useCallback(() => {
    finalizeListen('stopped');
    activeEngineObj()?.stop();
    activeEngine.current = null;
    loadedId.current = null;
    setIsPlaying(false);
    setQueueState(Q.EMPTY_QUEUE);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  // ---- sleep timer -----------------------------------------------------------------------
  const setSleepTimer = useCallback(
    (v: number | 'track' | null) => {
      if (v === null) {
        setSleep(null);
        setSleepRemaining(null);
        toast('Đã hủy hẹn giờ tắt', { duration: 1800 });
      } else if (v === 'track') {
        setSleep({ kind: 'track' });
        setSleepRemaining(null);
        toast('Nhạc sẽ tạm dừng khi hết bài này', { duration: 2400 });
      } else {
        setSleep({ kind: 'time', minutes: v, endsAt: Date.now() + v * 60_000 });
        setSleepRemaining(v * 60_000);
        toast(`Đã hẹn giờ tắt sau ${v} phút`, { duration: 2400 });
      }
    },
    [toast],
  );

  // ---- persistence -----------------------------------------------------------------------
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const persistNow = useCallback(() => {
    const s = live.current;
    savePlayerSnapshot(localStorage, {
      volume: s.volume, muted: s.muted, rate: rateRef.current, shuffle: s.shuffle, repeat: s.repeat,
      queue: s.queue.items, index: s.queue.index, position: s.currentTime,
    });
  }, []);

  // ---- clock: position, sleep countdown, periodic save ----------------------------------
  useEffect(() => {
    let ticks = 0;
    const id = setInterval(() => {
      const { isPlaying: playing, sleepTimer: sleep } = live.current;
      if (playing && loadedId.current) {
        const pos = activeEngineObj()?.getCurrentTime() ?? 0;
        // Car View performance mode: the UI only shows whole seconds → 1 render/s instead of 4
        if (!carMode() || Math.floor(pos) !== Math.floor(live.current.currentTime)) setCurrentTime(pos);
        if (session.current && session.current.track.id === loadedId.current) session.current.maxPos = Math.max(session.current.maxPos, pos);
      }
      if (sleep?.kind === 'time') {
        const left = sleep.endsAt - Date.now();
        if (left <= 0) {
          setSleep(null);
          setSleepRemaining(null);
          if (live.current.isPlaying) pause();
          toast('Hết giờ hẹn — đã tạm dừng nhạc', { duration: 6000 });
        } else setSleepRemaining(left);
      }
      if (++ticks % 20 === 0) persistNow();
    }, 250);
    return () => clearInterval(id);
  }, [pause, toast, persistNow]);

  useEffect(() => {
    const id = setTimeout(persistNow, 150);
    return () => clearTimeout(id);
  }, [queue, volume, muted, rate, shuffle, repeat, persistNow]);

  // ---- page lifecycle (phones: app switch, screen lock, back/forward cache) -------------------
  // Hiding the page never pauses or destroys anything: the media keeps going wherever the browser allows.
  // On return, the UI is re-synchronised with what the media is *actually* doing, because timers and
  // events may not have run while hidden (e.g. iOS pauses the YouTube video when the screen locks).
  useEffect(() => {
    const sync = () => {
      const t = live.current.track;
      const eng = activeEngineObj();
      if (!t || !eng || loadedId.current !== t.id) return;
      const actual = eng.isActuallyPlaying();
      if (actual !== live.current.isPlaying) setIsPlaying(actual);
      if (!actual) setBuffering(false);
      const pos = eng.getCurrentTime();
      if (Number.isFinite(pos)) setCurrentTime(pos);
    };
    const onVisibility = () => {
      diag('page.visibility', { state: document.visibilityState });
      if (document.hidden) persistNow();
      else sync();
    };
    const onHide = (e: PageTransitionEvent) => {
      diag('page.pagehide', { persisted: e.persisted });
      persistNow();
      // the page is really going away (not just into the back/forward cache): close the listening session
      if (!e.persisted) finalizeListen('closed');
    };
    const onShow = (e: PageTransitionEvent) => {
      diag('page.pageshow', { persisted: e.persisted });
      if (e.persisted) sync();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
    };
  }, [persistNow, finalizeListen]);

  // count only time actually spent playing
  useEffect(() => {
    const s = session.current;
    if (!s) return;
    if (isPlaying && !s.since) s.since = Date.now();
    else if (!isPlaying && s.since) {
      s.acc += Date.now() - s.since;
      s.since = null;
    }
  }, [isPlaying, track?.id]);

  // ---- OS media keys ---------------------------------------------------------------------
  // Media Session = Lock Screen / Control Center / headset metadata and buttons. It does not by itself keep
  // audio playing in the background — that depends on the browser and the playback provider.
  const ms = typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null;
  useEffect(() => {
    if (!ms) return;
    if (!track) {
      ms.metadata = null;
      return;
    }
    try {
      ms.metadata = new MediaMetadata({ title: track.title, artist: track.channel, album: 'AmberTube', artwork: artworkFor(track) });
    } catch {
      /* MediaMetadata unsupported */
    }
  }, [ms, track]);
  useEffect(() => {
    if (ms) ms.playbackState = !track ? 'none' : isPlaying ? 'playing' : 'paused';
  }, [ms, track, isPlaying]);
  useEffect(() => {
    if (!ms) return;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* action not supported by this browser */
      }
    };
    const rel = (d: number) => seek(Math.max(0, live.current.currentTime + d));
    set('play', () => play());
    set('pause', () => pause());
    set('previoustrack', () => prev());
    set('nexttrack', () => next());
    set('seekto', (d) => d.seekTime != null && seek(d.seekTime));
    set('seekbackward', (d) => rel(-(d.seekOffset || 10)));
    set('seekforward', (d) => rel(d.seekOffset || 10));
    set('stop', () => pause());
  }, [ms, play, pause, prev, next, seek]);
  // position for the Lock Screen scrubber: set on track/duration/play-state changes and after seeks;
  // the OS extrapolates in between, so no timer is needed while the page is hidden
  const lastPosSync = useRef(0);
  useEffect(() => {
    if (!ms?.setPositionState) return;
    const d = duration || track?.duration || 0;
    if (!track || track.isLive || !(d > 0)) return;
    const jumped = Math.abs(currentTime - lastPosSync.current) > 3; // a seek, not normal progress
    lastPosSync.current = currentTime;
    if (!jumped && isPlaying && !document.hidden) return;
    try {
      ms.setPositionState({ duration: d, playbackRate: isPlaying ? effectiveRate : 1, position: Math.min(d, Math.max(0, currentTime)) });
    } catch {
      /* invalid state while loading */
    }
  }, [ms, track, duration, isPlaying, currentTime, effectiveRate]);

  const ytHostRef = useCallback((el: HTMLDivElement | null) => {
    ytHost.current = el;
  }, []);

  const api = useMemo<PlayerApi>(
    () => ({
      track, queue: queue.items, index: queue.index, isPlaying, buffering, volume, muted, shuffle, repeat,
      rate, effectiveRate, speeds, sleepTimer, failedIds: failed, stalledAtEnd, autoReasons, autoplayBlocked, appendRecommendations, removeUpcomingRecommendations,
      hasRealAudio: track?.provider === 'local',
      ytHostRef,
      getAnalyser: () => (live.current.track?.provider === 'local' ? engineFor('local').getAnalyser() : null),
      isPlayable, playTrack, play, pause, togglePlay, next, prev, seek, setVolume, changeVolume, toggleMute,
      toggleShuffle, cycleRepeat, setRate, setSleepTimer, addToQueue, playNext, removeFromQueue, moveInQueue,
      clearQueue, jumpTo, stop,
    }),

    [track, queue, isPlaying, buffering, volume, muted, shuffle, repeat, rate, effectiveRate, speeds, sleepTimer, failed, stalledAtEnd, autoReasons, autoplayBlocked, appendRecommendations, removeUpcomingRecommendations,
      ytHostRef, isPlayable, playTrack, play, pause, togglePlay, next, prev, seek, setVolume, changeVolume, toggleMute,
      toggleShuffle, cycleRepeat, setRate, setSleepTimer, addToQueue, playNext, removeFromQueue, moveInQueue, clearQueue, jumpTo, stop],
  );

  const time = useMemo<PlayerTime>(() => ({ currentTime, duration, sleepRemaining }), [currentTime, duration, sleepRemaining]);

  return (
    <PlayerCtx.Provider value={api}>
      <TimeCtx.Provider value={time}>{children}</TimeCtx.Provider>
    </PlayerCtx.Provider>
  );
}

export function usePlayer(): PlayerApi {
  const ctx = useContext(PlayerCtx);
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider');
  return ctx;
}

/** Fast-changing playback position. Kept in its own context so the rest of the app doesn't re-render 4×/s. */
export const usePlayerTime = (): PlayerTime => useContext(TimeCtx);

