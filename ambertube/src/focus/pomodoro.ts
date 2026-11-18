// Pure Pomodoro state machine. Time is always derived from timestamps (endsAt), never from
// decrementing counters, so the timer can't drift and survives throttled/background tabs.

export type Phase = 'focus' | 'short' | 'long';
export type TimerStatus = 'idle' | 'running' | 'paused';

export interface PomodoroConfig {
  focusMin: number;
  shortMin: number;
  longMin: number;
  /** long break after this many completed focus sessions */
  longInterval: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
}

export interface TimerState {
  phase: Phase;
  status: TimerStatus;
  /** planned length of the current phase */
  durationMs: number;
  /** wall-clock end time while running */
  endsAt: number | null;
  /** remaining time while idle/paused */
  remainingMs: number;
  /** first start of the current phase; doubles as the session id */
  startedAt: number | null;
  /** focus sessions completed in the current cycle (0 … longInterval-1) */
  cycleCount: number;
  /** bumped on every change (used to sync tabs) */
  version: number;
}

export interface Transition {
  completed: Phase;
  sessionId: string;
  /** when the phase actually ended (its scheduled end time) */
  endedAt: number;
  durationMs: number;
  next: Phase;
  autoStarted: boolean;
}

const MIN = 60_000;

export function phaseMinutes(phase: Phase, cfg: PomodoroConfig): number {
  return phase === 'focus' ? cfg.focusMin : phase === 'short' ? cfg.shortMin : cfg.longMin;
}

export const phaseMs = (phase: Phase, cfg: PomodoroConfig) => Math.round(phaseMinutes(phase, cfg) * MIN);

export function initialTimer(cfg: PomodoroConfig): TimerState {
  const d = phaseMs('focus', cfg);
  return { phase: 'focus', status: 'idle', durationMs: d, endsAt: null, remainingMs: d, startedAt: null, cycleCount: 0, version: 0 };
}

const bump = (s: TimerState, patch: Partial<TimerState>): TimerState => ({ ...s, ...patch, version: s.version + 1 });

export function remaining(s: TimerState, now: number): number {
  return s.status === 'running' && s.endsAt !== null ? Math.max(0, s.endsAt - now) : s.remainingMs;
}

export function progress(s: TimerState, now: number): number {
  return s.durationMs > 0 ? Math.min(1, Math.max(0, 1 - remaining(s, now) / s.durationMs)) : 0;
}

export function start(s: TimerState, now: number): TimerState {
  if (s.status === 'running') return s;
  return bump(s, { status: 'running', endsAt: now + s.remainingMs, startedAt: s.startedAt ?? now });
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== 'running') return s;
  return bump(s, { status: 'paused', remainingMs: remaining(s, now), endsAt: null });
}

export const toggle = (s: TimerState, now: number): TimerState => (s.status === 'running' ? pause(s, now) : start(s, now));

/** Back to the full length of the current phase, stopped. */
export function reset(s: TimerState, cfg: PomodoroConfig): TimerState {
  const d = phaseMs(s.phase, cfg);
  return bump(s, { status: 'idle', durationMs: d, remainingMs: d, endsAt: null, startedAt: null });
}

/** Apply new durations to a timer that hasn't started yet (settings or duration chips changed). */
export function applyConfig(s: TimerState, cfg: PomodoroConfig): TimerState {
  if (s.status !== 'idle') return s;
  const d = phaseMs(s.phase, cfg);
  if (d === s.durationMs && d === s.remainingMs) return s;
  return bump(s, { durationMs: d, remainingMs: d });
}

export function nextPhase(completed: Phase, cycleCountAfter: number, cfg: PomodoroConfig): Phase {
  if (completed !== 'focus') return 'focus';
  return cycleCountAfter >= cfg.longInterval ? 'long' : 'short';
}

function enter(s: TimerState, phase: Phase, cycleCount: number, cfg: PomodoroConfig, run: boolean, at: number): TimerState {
  const d = phaseMs(phase, cfg);
  return bump(s, {
    phase,
    cycleCount,
    durationMs: d,
    remainingMs: d,
    status: run ? 'running' : 'idle',
    endsAt: run ? at + d : null,
    startedAt: run ? at : null,
  });
}

const autoFor = (phase: Phase, cfg: PomodoroConfig) => (phase === 'focus' ? cfg.autoStartFocus : cfg.autoStartBreaks);

/** Finish the current phase at time `at` (its scheduled end) and move to the next one. */
export function complete(s: TimerState, cfg: PomodoroConfig, at: number): { state: TimerState; transition: Transition } {
  const completed = s.phase;
  const afterCount = completed === 'focus' ? s.cycleCount + 1 : completed === 'long' ? 0 : s.cycleCount;
  const next = nextPhase(completed, afterCount, cfg);
  const auto = autoFor(next, cfg);
  const state = enter(s, next, next === 'long' ? afterCount : afterCount % Math.max(1, cfg.longInterval), cfg, auto, at);
  return {
    state,
    transition: { completed, sessionId: String(s.startedAt ?? at - s.durationMs), endedAt: at, durationMs: s.durationMs, next, autoStarted: auto },
  };
}

/** Advance every phase whose end time has passed (several, if the tab slept through them). */
export function tick(s: TimerState, cfg: PomodoroConfig, now: number): { state: TimerState; transitions: Transition[] } {
  const transitions: Transition[] = [];
  let state = s;
  let guard = 0;
  while (state.status === 'running' && state.endsAt !== null && state.endsAt <= now && guard++ < 50) {
    const r = complete(state, cfg, state.endsAt);
    state = r.state;
    transitions.push(r.transition);
  }
  return { state, transitions };
}

/** Skip to the next phase without counting the current one. Keeps running if it was running. */
export function skip(s: TimerState, cfg: PomodoroConfig, now: number): TimerState {
  const next: Phase = s.phase === 'focus' ? (s.cycleCount + 1 >= cfg.longInterval ? 'long' : 'short') : 'focus';
  const cycle = s.phase === 'long' ? 0 : s.cycleCount;
  return enter(s, next, cycle, cfg, s.status === 'running', now);
}

/** Jump straight into a phase (used by the completion dialog: "start break" / "keep focusing"). */
export function startPhase(s: TimerState, phase: Phase, cfg: PomodoroConfig, now: number): TimerState {
  return enter(s, phase, phase === 'focus' && s.phase === 'long' ? 0 : s.cycleCount, cfg, true, now);
}

export function isValidTimer(x: unknown): x is TimerState {
  const t = x as TimerState;
  return !!t && ['focus', 'short', 'long'].includes(t.phase) && ['idle', 'running', 'paused'].includes(t.status) &&
    Number.isFinite(t.durationMs) && Number.isFinite(t.remainingMs) && Number.isInteger(t.cycleCount);
}
