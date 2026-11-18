import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from './pomodoro.ts';
import { recordSession, todayStats, EMPTY_STATS, dayKey } from './stats.ts';
import { sanitizeFocusSettings, sanitizeAmbient, DEFAULT_FOCUS_SETTINGS } from './settings.ts';

const cfg: P.PomodoroConfig = { focusMin: 25, shortMin: 5, longMin: 15, longInterval: 4, autoStartBreaks: true, autoStartFocus: true };
const MIN = 60_000;
const T0 = new Date(2026, 10, 18, 9, 0, 0).getTime();

test('initial state is a 25-minute idle focus session', () => {
  const s = P.initialTimer(cfg);
  assert.equal(s.phase, 'focus');
  assert.equal(s.status, 'idle');
  assert.equal(P.remaining(s, T0), 25 * MIN);
});

test('remaining time is computed from timestamps (no drift)', () => {
  let s = P.start(P.initialTimer(cfg), T0);
  assert.equal(P.remaining(s, T0 + 10 * MIN + 500), 15 * MIN - 500);
  s = P.pause(s, T0 + 10 * MIN);
  assert.equal(P.remaining(s, T0 + 60 * MIN), 15 * MIN, 'paused time does not pass');
  s = P.start(s, T0 + 60 * MIN);
  assert.equal(s.endsAt, T0 + 75 * MIN);
  assert.equal(s.startedAt, T0, 'session id is kept across pause/resume');
});

test('full cycle: focus → short ×3 → long break after 4 focus sessions', () => {
  let s = P.start(P.initialTimer(cfg), T0);
  const phases: string[] = [];
  let now = T0;
  for (let i = 0; i < 8; i++) {
    now = s.endsAt!;
    const r = P.tick(s, cfg, now);
    assert.equal(r.transitions.length, 1);
    phases.push(`${r.transitions[0].completed}>${r.transitions[0].next}`);
    s = r.state;
  }
  assert.deepEqual(phases, ['focus>short', 'short>focus', 'focus>short', 'short>focus', 'focus>short', 'short>focus', 'focus>long', 'long>focus']);
  assert.equal(s.cycleCount, 0);
});

test('tick catches up on several phases missed while the tab slept', () => {
  const s = P.start(P.initialTimer(cfg), T0);
  const r = P.tick(s, cfg, T0 + 25 * MIN + 5 * MIN + 3 * MIN);
  assert.equal(r.transitions.length, 2);
  assert.equal(r.state.phase, 'focus');
  assert.equal(r.state.endsAt, T0 + 30 * MIN + 25 * MIN, 'next phase starts exactly when the previous ended');
});

test('without auto-start the next phase waits', () => {
  const manual = { ...cfg, autoStartBreaks: false, autoStartFocus: false };
  const s = P.start(P.initialTimer(manual), T0);
  const r = P.tick(s, manual, T0 + 26 * MIN);
  assert.equal(r.state.phase, 'short');
  assert.equal(r.state.status, 'idle');
  assert.equal(r.transitions[0].autoStarted, false);
  assert.equal(P.tick(r.state, manual, T0 + 99 * MIN).transitions.length, 0);
});

test('skip and reset', () => {
  let s = P.start(P.initialTimer(cfg), T0);
  s = P.skip(s, cfg, T0 + MIN);
  assert.equal(s.phase, 'short');
  assert.equal(s.status, 'running');
  assert.equal(s.cycleCount, 0, 'skipped focus is not counted');
  s = P.reset(s, cfg);
  assert.equal(s.status, 'idle');
  assert.equal(s.remainingMs, 5 * MIN);
  s = P.skip(s, cfg, T0);
  assert.equal(s.phase, 'focus');
  assert.equal(s.status, 'idle');
});

test('changing the focus length applies only before starting', () => {
  let s = P.initialTimer(cfg);
  s = P.applyConfig(s, { ...cfg, focusMin: 50 });
  assert.equal(s.remainingMs, 50 * MIN);
  s = P.start(s, T0);
  assert.equal(P.applyConfig(s, { ...cfg, focusMin: 15 }), s);
});

test('stats count each session once, per local day', () => {
  let d = recordSession(EMPTY_STATS, { id: 'a', minutes: 25, endedAt: T0 });
  d = recordSession(d, { id: 'a', minutes: 25, endedAt: T0 });
  d = recordSession(d, { id: 'b', minutes: 25, endedAt: T0 + MIN });
  d = recordSession(d, { id: 'c', minutes: 25, endedAt: T0 - 86_400_000 });
  assert.deepEqual(todayStats(d, T0), { sessions: 2, minutes: 50 });
  assert.equal(Object.keys(d.days).length, 2);
  assert.equal(dayKey(T0), '2026-11-18');
});

test('settings are validated', () => {
  assert.deepEqual(sanitizeFocusSettings(null), DEFAULT_FOCUS_SETTINGS);
  const s = sanitizeFocusSettings({ focusMin: 999, shortMin: -3, background: 'pink', autoStartFocus: 'yes' });
  assert.equal(s.focusMin, 180);
  assert.equal(s.shortMin, 1);
  assert.equal(s.background, 'amber');
  assert.equal(s.autoStartFocus, false);
  const a = sanitizeAmbient({ channels: { rain: { on: true, volume: 150 } }, master: 'x' });
  assert.deepEqual(a.channels.rain, { on: true, volume: 100 });
  assert.equal(a.master, 80);
  assert.equal(a.channels.white.on, false);
});
