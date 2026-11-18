// localStorage persistence for player preferences, the queue and the last played position.
import type { RepeatMode, Track } from '../types';
import { isSpeed } from './speeds.ts';

export const PLAYER_KEY = 'ambertube:player:v1';

export interface PlayerSnapshot {
  volume: number;
  muted: boolean;
  rate: number;
  shuffle: boolean;
  repeat: RepeatMode;
  queue: Track[];
  index: number;
  position: number;
}

export const DEFAULT_SNAPSHOT: PlayerSnapshot = {
  volume: 70,
  muted: false,
  rate: 1,
  shuffle: false,
  repeat: 'off',
  queue: [],
  index: -1,
  position: 0,
};

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

/** Local files are object URLs that die with the page, so they are never persisted. */
export function sanitizeQueue(queue: Track[], index: number): { queue: Track[]; index: number } {
  const currentId = queue[index]?.id;
  const kept = queue.filter((t) => t && typeof t.id === 'string' && t.provider !== 'local').map(({ src: _src, ...t }) => t as Track);
  return { queue: kept, index: currentId ? kept.findIndex((t) => t.id === currentId) : -1 };
}

export function loadPlayerSnapshot(storage: Storage): PlayerSnapshot {
  let raw: Partial<PlayerSnapshot> = {};
  try {
    raw = JSON.parse(storage.getItem(PLAYER_KEY) || '{}') ?? {};
  } catch {
    raw = {};
  }
  const legacyVolume = Number(storage.getItem('ambertube:volume'));
  const volume = Number.isFinite(raw.volume) ? (raw.volume as number) : Number.isFinite(legacyVolume) && storage.getItem('ambertube:volume') !== null ? legacyVolume : DEFAULT_SNAPSHOT.volume;
  const { queue, index } = sanitizeQueue(Array.isArray(raw.queue) ? raw.queue : [], Number.isInteger(raw.index) ? (raw.index as number) : -1);
  return {
    volume: Math.max(0, Math.min(100, Math.round(volume))),
    muted: raw.muted === true,
    rate: isSpeed(raw.rate) ? raw.rate : 1,
    shuffle: raw.shuffle === true,
    repeat: raw.repeat === 'all' || raw.repeat === 'one' ? raw.repeat : 'off',
    queue,
    index,
    position: index >= 0 && Number.isFinite(raw.position) && (raw.position as number) > 0 ? (raw.position as number) : 0,
  };
}

export function savePlayerSnapshot(storage: Storage, snap: PlayerSnapshot): void {
  const { queue, index } = sanitizeQueue(snap.queue, snap.index);
  try {
    storage.setItem(PLAYER_KEY, JSON.stringify({ ...snap, queue, index, position: index >= 0 ? Math.floor(snap.position) : 0 }));
  } catch {
    /* quota exceeded or storage disabled — preferences just won't persist */
  }
}
