/*
 * Connects the pure recommendation engine to the app:
 *  - builds the candidate pool from real data (demo catalogue / cached API searches / trending / your library)
 *  - Home sections (Made for You, Daily Mix, …)
 *  - Smart Radio and Smart Autoplay (keeps 5–10 recommendations queued after the user's own queue)
 * The player only receives tracks through its public API (appendRecommendations / playTrack).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Track } from '../types';
import { recommend, contextPicks, buildProfile, artistOf, type Inputs, type RadioMode, type Recommendations, type RecoContext, type RadioPick } from './engine';
import { info } from './identity';
import { GENRE_LABEL, genresOf, languageOf } from './style';
import { useListeningStore } from './ListeningStore';
import { usePlayer } from '../context/PlayerContext';
import { useLibrary } from '../context/LibraryContext';
import { useToast } from '../context/ToastContext';
import { useSearchHistory } from '../search/SearchHistoryContext';
import { getCachedTracks, getTrending, hasYouTubeApi, searchMusic } from '../services/youtube';
import { MOODS } from '../data/demoCatalog';
import { DEMO_TRACKS } from '../data/demoCatalog';
import { upcomingCount } from '../playback/queue';

const PREF_KEY = 'ambertube:smart-autoplay';
const REFILL_AT = 2; // fetch more when this many (or fewer) songs remain
const BATCH = 8; // 5–10 recommendations per refill
const API_LOOKUPS_PER_DAY = 20;

export type AutoplayStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

interface AutoplayPrefs {
  enabled: boolean;
  mode: RadioMode;
}

function readPrefs(): AutoplayPrefs {
  try {
    const r = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return { enabled: r.enabled !== false, mode: r.mode === 'similar' || r.mode === 'discovery' ? r.mode : 'balanced' };
  } catch {
    return { enabled: true, mode: 'balanced' };
  }
}

interface RecoApi {
  recs: Recommendations;
  trending: Track[];
  trendingSource: 'youtube' | 'demo' | null;
  startRadio(seed: Track): Promise<void>;
  startArtistRadio(artist: string, sample?: Track): Promise<void>;
  startMyRadio(): Promise<void>;
  startMoodRadio(moodId: string): Promise<void>;
  autoplay: AutoplayPrefs & { status: AutoplayStatus };
  setAutoplay(enabled: boolean): void;
  setMode(mode: RadioMode): void;
  refresh(): void;
  moreLikeThis(t: Track): void;
  lessLikeThis(t: Track): void;
}

const Ctx = createContext<RecoApi | null>(null);

// remember what was recommended (but maybe not played) so refreshes don't repeat the same candidates
const SHOWN_KEY = 'ambertube:reco-shown';
function readShown(): { key: string; at: number }[] {
  try {
    const r = JSON.parse(localStorage.getItem(SHOWN_KEY) || '[]');
    return Array.isArray(r) ? r.filter((x) => x && Date.now() - x.at < 3 * 86_400_000) : [];
  } catch {
    return [];
  }
}
function rememberShown(picks: RadioPick[]) {
  const list = [...readShown(), ...picks.map((p) => ({ key: info(p.track).key, at: Date.now() }))].slice(-300);
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
function shownCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of readShown()) out[s.key] = (out[s.key] ?? 0) + 1;
  return out;
}

/** Daily budget for extra API searches made by recommendations (quota protection). */
function takeApiBudget(): boolean {
  const key = 'ambertube:reco-api-budget';
  const today = new Date().toDateString();
  let b = { day: today, used: 0 };
  try {
    const r = JSON.parse(localStorage.getItem(key) || 'null');
    if (r && r.day === today) b = r;
  } catch {
    /* ignore */
  }
  if (b.used >= API_LOOKUPS_PER_DAY) return false;
  b.used++;
  localStorage.setItem(key, JSON.stringify(b));
  return true;
}

export function RecommendationProvider({ children }: { children: ReactNode }) {
  const store = useListeningStore();
  const player = usePlayer();
  const { saved, playlists, history: listens, settings, updateSettings } = useLibrary();
  const { history: searches } = useSearchHistory();
  const toast = useToast();
  const [trending, setTrending] = useState<Track[]>([]);
  const [trendingSource, setTrendingSource] = useState<'youtube' | 'demo' | null>(null);
  const [prefs, setPrefs] = useState<AutoplayPrefs>(readPrefs);
  const [status, setStatus] = useState<AutoplayStatus>('idle');
  const [poolVersion, setPoolVersion] = useState(0);
  const looked = useRef(new Set<string>());
  const quotaHit = useRef(false);

  useEffect(() => {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  }, [prefs]);

  useEffect(() => {
    getTrending().then((r) => { setTrending(r.items); setTrendingSource(r.source); }).catch(() => setTrendingSource(null));
  }, []);

  const inputs = useCallback((): Inputs => ({
    events: store.events,
    favorites: saved,
    playlistTracks: playlists.flatMap((p) => p.tracks),
    searches,
    feedback: store.feedback,
    pool: [
      ...(hasYouTubeApi ? [] : DEMO_TRACKS),
      ...getCachedTracks(),
      ...trending,
      ...listens.map((h) => h.track),
      ...saved,
      ...playlists.flatMap((p) => p.tracks),
    ],
    now: Date.now(),
    recentlyRecommended: shownCounts(),
  }), [store.events, store.feedback, saved, playlists, searches, trending, listens, poolVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const recs = useMemo(() => recommend(inputs()), [inputs]);

  /** One Music-category API search to widen the candidate pool (cached, daily budget, each query once). */
  const lookup = useCallback(async (q: string) => {
    if (!hasYouTubeApi || quotaHit.current || !q || looked.current.has(q.toLowerCase())) return false;
    looked.current.add(q.toLowerCase());
    if (!takeApiBudget()) return false;
    try {
      await searchMusic(q);
      setPoolVersion((v) => v + 1);
      return true;
    } catch (e) {
      if (/403|quota/i.test((e as Error).message)) quotaHit.current = true;
      throw e;
    }
  }, []);

  /**
   * Targeted candidate queries for a context. Never the seed's song title (that only returns other
   * uploads/covers of the same song): related artists first, then style + language.
   */
  const candidateQueries = useCallback((ctx: RecoContext): string[] => {
    const inp = liveRef.current.inputs();
    const prof = buildProfile(inp);
    const qs: string[] = [];
    const lang = (t?: Track) => (t && languageOf(t) === 'vi' ? 'nhạc ' : '');
    const styleQuery = (genres: string[], t?: Track) => genres.slice(0, 2).map((g) => GENRE_LABEL[g] ?? g).join(' ') && `${lang(t)}${genres.slice(0, 2).map((g) => GENRE_LABEL[g] ?? g).join(' ')}`;
    if (ctx.type === 'song' || ctx.type === 'autoplay') {
      const a = artistOf(ctx.track);
      const related = [...(prof.related.get(a) ?? [])].sort((x, y) => y[1] - x[1]).map(([k]) => k);
      qs.push(...related.slice(0, 2));
      const g = genresOf(ctx.track).length ? genresOf(ctx.track) : [...(prof.artistGenres.get(a) ?? new Map()).entries()].sort((x, y) => y[1] - x[1]).map(([k]) => k);
      if (g.length) qs.push(styleQuery(g, ctx.track));
      if (info(ctx.track).artistDisplay) qs.push(info(ctx.track).artistDisplay); // other songs by the artist (diversity caps apply)
    } else if (ctx.type === 'artist') {
      qs.push(ctx.artist, ...[...(prof.related.get(artistOf(ctx.sample ?? ({ title: '', channel: ctx.artist } as Track))) ?? [])].map(([k]) => k).slice(0, 2));
    } else if (ctx.type === 'mood') {
      const m = MOODS.find((x) => x.id === ctx.mood);
      if (m) qs.push(m.query);
    } else {
      const topG = [...prof.genre].sort((x, y) => y[1] - x[1]).map(([k]) => k);
      if (topG.length) qs.push(styleQuery(topG));
      const topA = [...prof.artist].sort((x, y) => y[1] - x[1]).map(([k]) => k);
      for (const a of topA.slice(0, 3)) qs.push(...[...(prof.related.get(a) ?? [])].map(([k]) => k).slice(0, 1));
    }
    return [...new Set(qs.filter(Boolean))].slice(0, 5);
  }, []);

  /** With an API key, widen the pool for a context; tries up to `maxQueries` new lookups. */
  const enrich = useCallback(async (ctx: RecoContext, maxQueries = 1) => {
    if (!hasYouTubeApi) return;
    let done = 0;
    for (const q of candidateQueries(ctx)) {
      if (done >= maxQueries) break;
      if (await lookup(q)) done++;
    }
  }, [lookup, candidateQueries]);

  // ---------------- Smart Autoplay ----------------
  const busy = useRef(false);
  const token = useRef(0);
  const exhaustedFor = useRef<string | null>(null);
  const liveRef = useRef({ player, prefs, inputs, settings, updateSettings });
  liveRef.current = { player, prefs, inputs, settings, updateSettings };

  const refill = useCallback(async (force = false) => {
    const { player: p, prefs: pr, inputs: inp } = liveRef.current;
    const seed = p.track;
    if (!pr.enabled || !seed || busy.current) return;
    const q = { items: p.queue, index: p.index };
    if (!force && upcomingCount(q) > REFILL_AT) return;
    if (!force && exhaustedFor.current === seed.id) return;
    busy.current = true;
    const my = ++token.current;
    setStatus('loading');
    let error = false;
    try {
      const ctx: RecoContext = { type: 'autoplay', track: seed };
      const compute = () => {
        const base = liveRef.current.inputs();
        const queue = liveRef.current.player.queue; // songs already queued (by identity, not just id)
        return contextPicks(ctx, base, BATCH, { mode: liveRef.current.prefs.mode, excludeTracks: queue });
      };
      let picks = compute();
      // too few good candidates → widen the pool with targeted searches (API mode only)
      if (picks.length < 5 && hasYouTubeApi) {
        await enrich(ctx, 2).catch(() => { error = true; });
        if (my !== token.current) return;
        picks = compute();
      }
      if (my !== token.current) return;
      const added = picks.length ? liveRef.current.player.appendRecommendations(picks) : 0;
      if (added) rememberShown(picks);
      // the song that was playing failed (unavailable) and had nothing after it → move on to the first recommendation
      // …or it already ended at the end of the queue before the refill landed → continue with the recommendations
      const pl = liveRef.current.player;
      if (added && pl.track && ((pl.failedIds.has(pl.track.id) && !pl.isPlaying) || pl.stalledAtEnd)) setTimeout(() => liveRef.current.player.next(), 0);
      if (!added) exhaustedFor.current = seed.id;
      setStatus(added ? 'ready' : error ? 'error' : 'empty');
    } finally {
      if (my === token.current) busy.current = false;
    }
  }, [enrich]);

  // older saved settings could have "advance to next song" off while Smart Autoplay is on → the ∞ button looked broken
  useEffect(() => {
    if (prefs.enabled && !settings.autoplay) updateSettings({ autoplay: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // the queue ran out before recommendations arrived (e.g. a slow or failed lookup): try again right away
  useEffect(() => {
    if (prefs.enabled && player.stalledAtEnd) {
      exhaustedFor.current = null;
      void refill(true);
    }
  }, [prefs.enabled, player.stalledAtEnd, refill]);

  // refill whenever the queue runs low
  const upcoming = upcomingCount({ items: player.queue, index: player.index });
  useEffect(() => {
    if (prefs.enabled && player.track && upcoming <= REFILL_AT) void refill();
  }, [prefs.enabled, player.track?.id, upcoming, refill]); // eslint-disable-line react-hooks/exhaustive-deps

  const setAutoplay = useCallback((enabled: boolean) => {
    setPrefs((p) => ({ ...p, enabled }));
    // Smart Autoplay is useless if the player doesn't advance to the next song: turn that on too
    if (enabled && !liveRef.current.settings.autoplay) liveRef.current.updateSettings({ autoplay: true });
    token.current++;
    busy.current = false;
    if (!enabled) {
      liveRef.current.player.removeUpcomingRecommendations(); // the current song keeps playing
      setStatus('idle');
    } else exhaustedFor.current = null;
  }, []);

  const refresh = useCallback(() => {
    token.current++;
    busy.current = false;
    exhaustedFor.current = null;
    liveRef.current.player.removeUpcomingRecommendations();
    // the low-queue effect refills right away; this is a fallback if the queue wasn't low
    setTimeout(() => void refill(), 50);
  }, [refill]);

  const setMode = useCallback((mode: RadioMode) => {
    setPrefs((p) => ({ ...p, mode }));
    liveRef.current.prefs = { ...liveRef.current.prefs, mode };
    refresh();
  }, [refresh]);

  const moreLikeThis = useCallback((t: Track) => {
    store.moreLikeThis(t);
    toast(`Sẽ gợi ý thêm bài giống “${t.title}”`, { type: 'success', duration: 2200 });
    setTimeout(refresh, 0);
  }, [store, toast, refresh]);

  const lessLikeThis = useCallback((t: Track) => {
    store.lessLikeThis(t);
    toast(`Sẽ bớt gợi ý bài giống “${t.title}”`, { duration: 2200 });
    setTimeout(refresh, 0);
  }, [store, toast, refresh]);

  // ---------------- Radio (song / artist / my / mood) ----------------
  const runRadio = useCallback(async (ctx: RecoContext, title: string) => {
    await enrich(ctx, 2).catch(() => {});
    const base = liveRef.current.inputs();
    const picks = contextPicks(ctx, base, 15, { mode: liveRef.current.prefs.mode, maxPerArtist: ctx.type === 'artist' ? 4 : 2 });
    const pl = liveRef.current.player;
    let rest = picks;
    if (ctx.type === 'song') {
      if (pl.track?.id === ctx.track.id) {
        // radio from the song that's already playing: keep it playing, replace what comes next
        pl.removeUpcomingRecommendations();
        if (!pl.isPlaying) pl.play();
      } else pl.playTrack(ctx.track, [ctx.track]);
    } else {
      if (!picks.length) {
        toast('Chưa đủ dữ liệu để tạo radio này', { type: 'warning' });
        return;
      }
      pl.playTrack(picks[0].track, [picks[0].track]);
      rest = picks.slice(1);
    }
    const n = rest.length ? pl.appendRecommendations(rest.map((p) => ({ ...p, reason: `Radio: ${p.reason || `thuộc ${title}`}` }))) : 0;
    if (n) rememberShown(rest);
    toast(n ? `${title} · ${n + (ctx.type === 'song' ? 0 : 1)} bài` : 'Chưa đủ dữ liệu để tạo radio cho bài này', { type: n ? 'success' : 'warning' });
  }, [enrich, toast]);

  const startRadio = useCallback((seed: Track) => runRadio({ type: 'song', track: seed }, `Radio từ “${seed.title}”`), [runRadio]);
  const startArtistRadio = useCallback((artist: string, sample?: Track) => runRadio({ type: 'artist', artist, sample }, `Radio nghệ sĩ ${artist}`), [runRadio]);
  const startMyRadio = useCallback(() => runRadio({ type: 'my' }, 'Radio của tôi'), [runRadio]);
  const startMoodRadio = useCallback((moodId: string) => runRadio({ type: 'mood', mood: moodId }, `Radio ${MOODS.find((m) => m.id === moodId)?.label ?? ''}`), [runRadio]);

  const value = useMemo<RecoApi>(() => ({
    recs, trending, trendingSource, startRadio, startArtistRadio, startMyRadio, startMoodRadio,
    autoplay: { ...prefs, status }, setAutoplay, setMode, refresh, moreLikeThis, lessLikeThis,
  }), [recs, trending, trendingSource, startRadio, startArtistRadio, startMyRadio, startMoodRadio, prefs, status, setAutoplay, setMode, refresh, moreLikeThis, lessLikeThis]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRecommendations(): RecoApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRecommendations must be used inside RecommendationProvider');
  return ctx;
}
