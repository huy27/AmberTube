// Small helpers shared by the always-loaded sync shell and the (lazily loaded) sync engine.
import type { Track } from '../types.ts';

type Content = Record<string, unknown>;

const SNAP_KEYS = ['title', 'channel', 'channelId', 'views', 'duration', 'isLive', 'license', 'thumbnail', 'art', 'genres', 'lang', 'categoryId'] as const;

/** The metadata kept with a synced song so lists render without asking YouTube again. */
export function snapshot(t: Track): Content {
  const o: Content = {};
  for (const k of SNAP_KEYS) {
    const v = t[k];
    if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) continue;
    if (typeof v === 'string' && v.length > 600) continue;
    o[k] = v;
  }
  return o;
}


/** Stable JSON (sorted keys), so equal data always serializes the same way. */
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  return `{${Object.keys(v).filter((k) => (v as Content)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Content)[k])}`).join(',')}}`;
}
