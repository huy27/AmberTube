/*
 * PomodoroController — the single timer controller for Focus mode.
 * Lives above the router, so the session keeps running while the user navigates the app.
 * All timing rules are in ./pomodoro.ts; this provider only schedules ticks, persists state,
 * records statistics and fires notifications.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import * as P from './pomodoro';
import { EMPTY_STATS, isValidStats, recordSession, todayStats, type StatsData } from './stats';
import { sanitizeAmbient, sanitizeFocusSettings, type AmbientPrefs, type FocusSettings } from './settings';
import { playChime } from './audio';
import { usePlayer } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';
import { scopedKey, useScope } from '../sync/scope';

const KEYS = {
  settings: 'ambertube:focus:settings',
  ambient: 'ambertube:focus:ambient',
  timer: 'ambertube:focus:timer',
  stats: 'ambertube:focus:stats',
};

export const PHASE_LABEL: Record<P.Phase, string> = { focus: 'Phiên tập trung', short: 'Nghỉ ngắn', long: 'Nghỉ dài' };

function read<T>(key: string, fallback: T, validate: (x: unknown) => T | null): T {
  try {
    const v = validate(JSON.parse(localStorage.getItem(key) || 'null'));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export interface FocusApi {
  settings: FocusSettings;
  updateSettings(patch: Partial<FocusSettings>): void;
  ambient: AmbientPrefs;
  updateAmbient(fn: (a: AmbientPrefs) => AmbientPrefs): void;
  timer: P.TimerState;
  start(): void;
  pause(): void;
  toggle(): void;
  reset(): void;
  skip(): void;
  setFocusMinutes(min: number): void;
  startPhase(phase: P.Phase): void;
  completion: P.Transition | null;
  dismissCompletion(): void;
  stats: StatsData;
  today: { sessions: number; minutes: number };
  /** focus session number the user is on today (1-based) */
  sessionNumber: number;
  notificationPermission: NotificationPermission | 'unsupported';
  requestNotificationPermission(): Promise<boolean>;
}

const FocusCtx = createContext<FocusApi | null>(null);
const FocusClockCtx = createContext<{ remainingMs: number; progress: number }>({ remainingMs: 0, progress: 0 });

export function PomodoroController({ children }: { children: ReactNode }) {
  const toast = useToast();
  const player = usePlayer();
  const location = useLocation();
  const scope = useScope();
  const settingsScope = useRef(scope);
  const [settings, setSettings] = useState<FocusSettings>(() => read(scopedKey(KEYS.settings), sanitizeFocusSettings(null), (x) => sanitizeFocusSettings(x)));
  const [ambient, setAmbient] = useState<AmbientPrefs>(() => read(KEYS.ambient, sanitizeAmbient(null), (x) => sanitizeAmbient(x)));
  const [timer, setTimer] = useState<P.TimerState>(() => read(KEYS.timer, P.initialTimer(settings), (x) => (P.isValidTimer(x) ? x : null)));
  const [stats, setStats] = useState<StatsData>(() => read(KEYS.stats, EMPTY_STATS, (x) => (isValidStats(x) ? x : null)));
  const [completion, setCompletion] = useState<P.Transition | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => ('Notification' in window ? Notification.permission : 'unsupported'));

  const live = useRef({ timer, settings, player, onFocusPage: false });
  live.current = { timer, settings, player, onFocusPage: location.pathname === '/focus' };
  const pausedMusicForBreak = useRef(false);

  // ---- persistence ----
  // focus settings belong to the account (synced); the running timer and stats stay with the device
  useEffect(() => {
    if (settingsScope.current === scope) return;
    settingsScope.current = scope;
    const next = read(scopedKey(KEYS.settings, scope), sanitizeFocusSettings(null), (x) => sanitizeFocusSettings(x));
    live.current.settings = next;
    setSettings(next);
  }, [scope]);
  useEffect(() => write(scopedKey(KEYS.settings, settingsScope.current), settings), [settings]);
  useEffect(() => write(KEYS.ambient, ambient), [ambient]);
  useEffect(() => write(KEYS.timer, timer), [timer]);
  useEffect(() => write(KEYS.stats, stats), [stats]);

  // another tab changed the timer/stats → adopt its state, so two tabs never run separate timers
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.newValue) return;
      try {
        const v = JSON.parse(e.newValue);
        if (e.key === KEYS.timer && P.isValidTimer(v) && v.version > live.current.timer.version) setTimer(v);
        if (e.key === KEYS.stats && isValidStats(v)) setStats(v);
        if (e.key === scopedKey(KEYS.settings, settingsScope.current)) setSettings(sanitizeFocusSettings(v));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ---- music coupling (only when the user enabled it) ----
  const onEnterPhase = useCallback((phase: P.Phase, running: boolean) => {
    const { settings: s, player: pl } = live.current;
    if (!s.pauseMusicOnBreak) return;
    if (phase !== 'focus' && running && pl.isPlaying) {
      pl.pause();
      pausedMusicForBreak.current = true;
    } else if (phase === 'focus' && running && pausedMusicForBreak.current) {
      pausedMusicForBreak.current = false;
      pl.play();
    }
  }, []);

  // ---- notifications ----
  const notify = useCallback(
    (t: P.Transition) => {
      const { settings: s, onFocusPage } = live.current;
      const title = t.completed === 'focus' ? 'Tuyệt vời! Bạn đã hoàn thành phiên tập trung.' : 'Hết giờ nghỉ!';
      const body = t.completed === 'focus'
        ? (t.autoStarted ? `${PHASE_LABEL[t.next]} đã bắt đầu.` : `Sẵn sàng cho ${PHASE_LABEL[t.next].toLowerCase()}?`)
        : (t.autoStarted ? 'Phiên tập trung mới đã bắt đầu.' : 'Sẵn sàng tập trung tiếp chưa?');
      if (s.soundNotification) playChime(t.completed === 'focus' ? 'focus-done' : 'break-done');
      if (s.desktopNotification && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, { body, tag: 'ambertube-focus', silent: true });
        } catch {
          /* some browsers only allow notifications from a service worker */
        }
      }
      if (!onFocusPage) toast(`${title} ${body}`, { type: 'success', duration: 6000 });
    },
    [toast],
  );

  // ---- the single ticking loop ----
  const runTick = useCallback(() => {
    const t = Date.now();
    setNow(t);
    const { timer: cur, settings: s } = live.current;
    if (cur.status !== 'running') return;
    const r = P.tick(cur, s, t);
    if (!r.transitions.length) return;
    setTimer(r.state);
    live.current.timer = r.state;
    setStats((st) => {
      let out = st;
      for (const tr of r.transitions) {
        if (tr.completed === 'focus') out = recordSession(out, { id: tr.sessionId, minutes: tr.durationMs / 60_000, endedAt: tr.endedAt });
      }
      return out;
    });
    const last = r.transitions[r.transitions.length - 1];
    setCompletion(last);
    notify(last);
    onEnterPhase(r.state.phase, r.state.status === 'running');
  }, [notify, onEnterPhase]);

  useEffect(() => {
    if (timer.status !== 'running') {
      setNow(Date.now());
      return;
    }
    runTick();
    const id = setInterval(runTick, 250);
    return () => clearInterval(id);
  }, [timer.status, timer.version, runTick]);

  // background tabs throttle timers — re-sync the moment the tab becomes visible again
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && runTick();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [runTick]);

  // durations changed in settings → apply to a timer that hasn't started
  useEffect(() => {
    const n = P.applyConfig(live.current.timer, settings);
    if (n !== live.current.timer) {
      live.current.timer = n;
      setTimer(n);
    }
  }, [settings.focusMin, settings.shortMin, settings.longMin]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- actions ----
  const act = useCallback((fn: (t: P.TimerState, now: number) => P.TimerState) => {
    const n = fn(live.current.timer, Date.now());
    live.current.timer = n;
    setTimer(n);
    return n;
  }, []);

  const start = useCallback(() => {
    const n = act((t, now) => P.start(t, now));
    onEnterPhase(n.phase, true);
  }, [act, onEnterPhase]);
  const pause = useCallback(() => act((t, n) => P.pause(t, n)), [act]);
  const toggle = useCallback(() => {
    if (live.current.timer.status === 'running') pause();
    else start();
  }, [pause, start]);
  const reset = useCallback(() => act((t) => P.reset(t, live.current.settings)), [act]);
  const skip = useCallback(() => {
    const n = act((t, now) => P.skip(t, live.current.settings, now));
    setCompletion(null);
    onEnterPhase(n.phase, n.status === 'running');
  }, [act, onEnterPhase]);
  const startPhase = useCallback((phase: P.Phase) => {
    act((t, n) => P.startPhase(t, phase, live.current.settings, n));
    setCompletion(null);
    onEnterPhase(phase, true);
  }, [act, onEnterPhase]);

  const updateSettings = useCallback((patch: Partial<FocusSettings>) => {
    const next = sanitizeFocusSettings({ ...live.current.settings, ...patch });
    live.current.settings = next;
    setSettings(next);
    // a timer that hasn't started picks up new durations immediately (no stale frame)
    const t = P.applyConfig(live.current.timer, next);
    if (t !== live.current.timer) {
      live.current.timer = t;
      setTimer(t);
    }
  }, []);
  const setFocusMinutes = useCallback((min: number) => updateSettings({ focusMin: min }), [updateSettings]);
  const updateAmbient = useCallback((fn: (a: AmbientPrefs) => AmbientPrefs) => setAmbient((a) => sanitizeAmbient(fn(a))), []);

  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) return false;
    const p = await Notification.requestPermission();
    setPermission(p);
    return p === 'granted';
  }, []);

  const today = todayStats(stats, now);
  const api = useMemo<FocusApi>(
    () => ({
      settings, updateSettings, ambient, updateAmbient, timer, start, pause, toggle, reset, skip, setFocusMinutes, startPhase,
      completion, dismissCompletion: () => setCompletion(null), stats, today,
      sessionNumber: today.sessions + (timer.phase === 'focus' ? 1 : 0) || 1,
      notificationPermission: permission, requestNotificationPermission,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, ambient, timer, completion, stats, today.sessions, today.minutes, permission, start, pause, toggle, reset, skip, setFocusMinutes, startPhase, updateSettings, updateAmbient, requestNotificationPermission],
  );
  const clock = useMemo(() => ({ remainingMs: P.remaining(timer, now), progress: P.progress(timer, now) }), [timer, now]);

  return (
    <FocusCtx.Provider value={api}>
      <FocusClockCtx.Provider value={clock}>{children}</FocusClockCtx.Provider>
    </FocusCtx.Provider>
  );
}

export function useFocus(): FocusApi {
  const ctx = useContext(FocusCtx);
  if (!ctx) throw new Error('useFocus must be used inside PomodoroController');
  return ctx;
}

/** Fast-changing countdown values, separated so only timer UI re-renders every tick. */
export const useFocusClock = () => useContext(FocusClockCtx);

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
}
