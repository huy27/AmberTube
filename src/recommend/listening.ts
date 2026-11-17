// Listening events and per-track aggregation (pure).
import type { Track } from '../types.ts';

export type EndReason = 'ended' | 'skipped' | 'switched' | 'stopped' | 'closed';

export interface ListenEvent {
  id: string;
  trackId: string;
  track: Track;
  /** when playback of this track started */
  at: number;
  /** seconds actually spent playing (not wall time while paused) */
  listenedSec: number;
  durationSec: number;
  /** furthest position reached / duration (0..1) */
  completion: number;
  reason: EndReason;
}

export interface TrackStat {
  track: Track;
  /** plays that count as real listening */
  plays: number;
  /** selections that were abandoned quickly */
  skips: number;
  listenSec: number;
  bestCompletion: number;
  lastAt: number;
  firstAt: number;
}

export const LISTEN_KEY = 'ambertube:listens:v1';
export const RETENTION_DAYS = 120;
export const MAX_EVENTS = 1500;

/** A selection only becomes a preference signal after real listening. */
export function isRealListen(e: Pick<ListenEvent, 'listenedSec' | 'completion' | 'durationSec'>): boolean {
  if (e.listenedSec >= 30) return true;
  if (e.durationSec > 0 && e.durationSec < 60) return e.completion >= 0.8;
  return e.completion >= 0.5 && e.listenedSec >= 10;
}

/** Quickly moving on from a track = negative signal. Very short accidental taps (<3s) are ignored. */
export function isSkip(e: Pick<ListenEvent, 'listenedSec' | 'completion' | 'reason' | 'durationSec'>): boolean {
  if (e.reason !== 'skipped' && e.reason !== 'switched') return false;
  if (isRealListen(e)) return false;
  return e.listenedSec >= 3;
}

export function prune(events: ListenEvent[], now: number): ListenEvent[] {
  const cutoff = now - RETENTION_DAYS * 86_400_000;
  return events.filter((e) => e.at >= cutoff).slice(-MAX_EVENTS);
}

export function aggregate(events: ListenEvent[]): Map<string, TrackStat> {
  const stats = new Map<string, TrackStat>();
  for (const e of events) {
    let s = stats.get(e.trackId);
    if (!s) {
      s = { track: e.track, plays: 0, skips: 0, listenSec: 0, bestCompletion: 0, lastAt: e.at, firstAt: e.at };
      stats.set(e.trackId, s);
    }
    s.track = e.track;
    s.listenSec += e.listenedSec;
    s.bestCompletion = Math.max(s.bestCompletion, e.completion);
    s.lastAt = Math.max(s.lastAt, e.at);
    s.firstAt = Math.min(s.firstAt, e.at);
    if (isRealListen(e)) s.plays += 1;
    else if (isSkip(e)) s.skips += 1;
  }
  return stats;
}
