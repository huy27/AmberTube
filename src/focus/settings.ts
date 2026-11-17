import type { PomodoroConfig } from './pomodoro.ts';

export type BackgroundPreset = 'amber' | 'midnight' | 'forest';
export type AmbientId = 'rain' | 'ocean' | 'forest' | 'fire' | 'wind' | 'cafe' | 'white';

export interface FocusSettings extends PomodoroConfig {
  soundNotification: boolean;
  desktopNotification: boolean;
  background: BackgroundPreset;
  artworkBlur: boolean;
  particles: boolean;
  /** daily goal in focus sessions */
  dailyGoal: number;
  /** pause music during breaks and resume it when focus starts again */
  pauseMusicOnBreak: boolean;
}

export interface AmbientChannel {
  on: boolean;
  volume: number; // 0..100
}

export interface AmbientPrefs {
  muted: boolean;
  master: number; // 0..100
  channels: Record<AmbientId, AmbientChannel>;
}

export const AMBIENT_IDS: AmbientId[] = ['rain', 'ocean', 'forest', 'fire', 'wind', 'cafe', 'white'];

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  longInterval: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  soundNotification: true,
  desktopNotification: false,
  background: 'amber',
  artworkBlur: true,
  particles: true,
  dailyGoal: 4,
  pauseMusicOnBreak: false,
};

export const DEFAULT_AMBIENT: AmbientPrefs = {
  muted: false,
  master: 80,
  channels: Object.fromEntries(AMBIENT_IDS.map((id) => [id, { on: false, volume: 50 }])) as Record<AmbientId, AmbientChannel>,
};

const clampInt = (v: unknown, min: number, max: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);

export function sanitizeFocusSettings(raw: unknown): FocusSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<FocusSettings>;
  const d = DEFAULT_FOCUS_SETTINGS;
  return {
    focusMin: clampInt(r.focusMin, 1, 180, d.focusMin),
    shortMin: clampInt(r.shortMin, 1, 60, d.shortMin),
    longMin: clampInt(r.longMin, 1, 90, d.longMin),
    longInterval: clampInt(r.longInterval, 2, 12, d.longInterval),
    autoStartBreaks: bool(r.autoStartBreaks, d.autoStartBreaks),
    autoStartFocus: bool(r.autoStartFocus, d.autoStartFocus),
    soundNotification: bool(r.soundNotification, d.soundNotification),
    desktopNotification: bool(r.desktopNotification, d.desktopNotification),
    background: r.background === 'midnight' || r.background === 'forest' ? r.background : 'amber',
    artworkBlur: bool(r.artworkBlur, d.artworkBlur),
    particles: bool(r.particles, d.particles),
    dailyGoal: clampInt(r.dailyGoal, 1, 24, d.dailyGoal),
    pauseMusicOnBreak: bool(r.pauseMusicOnBreak, d.pauseMusicOnBreak),
  };
}

export function sanitizeAmbient(raw: unknown): AmbientPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AmbientPrefs>;
  const channels = { ...DEFAULT_AMBIENT.channels };
  for (const id of AMBIENT_IDS) {
    const c = r.channels?.[id];
    if (c) channels[id] = { on: bool(c.on, false), volume: clampInt(c.volume, 0, 100, 50) };
  }
  return { muted: bool(r.muted, false), master: clampInt(r.master, 0, 100, 80), channels };
}
