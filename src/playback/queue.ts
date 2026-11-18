// Pure queue operations. The queue always tracks the current item by position (index);
// every operation keeps `index` pointing at the same track it pointed at before.
import type { RepeatMode, Track } from '../types';
import { containsSong } from '../recommend/identity.ts';

export interface QueueState {
  items: Track[];
  /** -1 when nothing is loaded */
  index: number;
}

export const EMPTY_QUEUE: QueueState = { items: [], index: -1 };

export const currentOf = (q: QueueState): Track | null => (q.index >= 0 ? q.items[q.index] ?? null : null);

function withCurrent(items: Track[], currentId: string | undefined): QueueState {
  return { items, index: currentId ? items.findIndex((t) => t.id === currentId) : -1 };
}

/** Replace the queue with `items`, starting at the item with `startId`. */
export function fromList(items: Track[], startId: string): QueueState {
  const seen = new Set<string>();
  const unique = items.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  const index = unique.findIndex((t) => t.id === startId);
  return index >= 0 ? { items: unique, index } : { items: [items.find((t) => t.id === startId)!, ...unique].filter(Boolean), index: 0 };
}

/** Add to the end. If the track is already upcoming/played it is moved; the current track is left alone. */
export function append(q: QueueState, track: Track): QueueState {
  const cur = currentOf(q);
  if (cur?.id === track.id) return q;
  const items = q.items.filter((t) => t.id !== track.id);
  return withCurrent([...items, track], cur?.id);
}

/** Insert right after the current track. */
export function insertNext(q: QueueState, track: Track): QueueState {
  const cur = currentOf(q);
  if (cur?.id === track.id) return q;
  if (!cur) return { items: [track, ...q.items.filter((t) => t.id !== track.id)], index: -1 };
  const items = q.items.filter((t) => t.id !== track.id);
  const ci = items.findIndex((t) => t.id === cur.id);
  items.splice(ci + 1, 0, track);
  return withCurrent(items, cur.id);
}

/** Remove a track. The currently playing track can't be removed. */
export function remove(q: QueueState, id: string): QueueState {
  const cur = currentOf(q);
  if (cur?.id === id) return q;
  return withCurrent(q.items.filter((t) => t.id !== id), cur?.id);
}

/** Move the item at `from` to position `to` (positions in the current array). */
export function move(q: QueueState, from: number, to: number): QueueState {
  if (from === to || from < 0 || from >= q.items.length) return q;
  const cur = currentOf(q);
  const items = q.items.slice();
  const [item] = items.splice(from, 1);
  items.splice(Math.max(0, Math.min(items.length, to)), 0, item);
  return withCurrent(items, cur?.id);
}

/** Clear everything except the current track. */
export function clear(q: QueueState): QueueState {
  const cur = currentOf(q);
  return cur ? { items: [cur], index: 0 } : EMPTY_QUEUE;
}

export interface PickOptions {
  shuffle: boolean;
  repeat: RepeatMode;
  /** true when the current track ended by itself (vs. the user pressing Next) */
  auto: boolean;
  isPlayable: (t: Track) => boolean;
  /** ids already played in the current shuffle cycle */
  played?: ReadonlySet<string>;
  random?: () => number;
}

export interface Pick {
  index: number;
  /** shuffle cycle was exhausted and restarted */
  cycleReset: boolean;
}

/**
 * Choose the next index. Unplayable tracks are skipped. Returns null when playback should stop
 * (end of queue with repeat off, or nothing playable left).
 */
export function pickNext(q: QueueState, opts: PickOptions): Pick | null {
  const n = q.items.length;
  if (!n) return null;
  const wrap = opts.repeat !== 'off' || !opts.auto;
  const playable = (i: number) => i !== q.index && opts.isPlayable(q.items[i]);

  if (opts.shuffle) {
    const rand = opts.random ?? Math.random;
    const all = q.items.map((_, i) => i).filter(playable);
    const fresh = all.filter((i) => !opts.played?.has(q.items[i].id));
    if (fresh.length) return { index: fresh[Math.floor(rand() * fresh.length)], cycleReset: false };
    if (wrap && all.length) return { index: all[Math.floor(rand() * all.length)], cycleReset: true };
    return null;
  }

  for (let step = 1; step <= n; step++) {
    let i = q.index + step;
    if (i >= n) {
      if (!wrap) return null;
      i %= n;
    }
    if (i === q.index) break;
    if (playable(i)) return { index: i, cycleReset: false };
  }
  return null;
}

/** Previous playable track (wraps around). */
export function pickPrev(q: QueueState, isPlayable: (t: Track) => boolean): number | null {
  const n = q.items.length;
  for (let step = 1; step < n; step++) {
    const i = (((q.index - step) % n) + n) % n;
    if (isPlayable(q.items[i])) return i;
  }
  return null;
}

/**
 * Manual "Add to queue": goes after other manually queued tracks but BEFORE upcoming
 * auto-recommended tracks, so recommendations never push the user's choices back.
 */
export function appendManual(q: QueueState, track: Track, isAuto: (id: string) => boolean): QueueState {
  const cur = currentOf(q);
  if (cur?.id === track.id) return q;
  const items = q.items.filter((t) => t.id !== track.id);
  const ci = cur ? items.findIndex((t) => t.id === cur.id) : -1;
  let at = items.length;
  for (let i = ci + 1; i < items.length; i++) {
    if (isAuto(items[i].id)) {
      at = i;
      break;
    }
  }
  items.splice(at, 0, track);
  return withCurrent(items, cur?.id);
}

/** Append recommendations at the end, skipping anything already in the queue. */
export function appendAuto(q: QueueState, tracks: Track[]): { state: QueueState; added: Track[] } {
  // dedupe by song identity (not just video id): never queue another upload of a song already in the queue
  const have: Track[] = [...q.items];
  const added: Track[] = [];
  for (const t of tracks) {
    if (containsSong(have, t)) continue;
    have.push(t);
    added.push(t);
  }
  if (!added.length) return { state: q, added };
  return { state: { items: [...q.items, ...added], index: q.index }, added };
}

/** Remove upcoming (not yet played) tracks matching `pred`. Current and past tracks are kept. */
export function removeUpcoming(q: QueueState, pred: (t: Track) => boolean): QueueState {
  const cur = currentOf(q);
  const items = q.items.filter((t, i) => i <= q.index || !pred(t));
  return items.length === q.items.length ? q : withCurrent(items, cur?.id);
}

/** Drop the oldest already-played items so at most `keep` remain before the current one. */
export function trimPlayed(q: QueueState, keep = 50): QueueState {
  const drop = q.index - keep;
  if (drop <= 0) return q;
  return { items: q.items.slice(drop), index: q.index - drop };
}

export const upcomingCount = (q: QueueState): number => Math.max(0, q.items.length - q.index - 1);
