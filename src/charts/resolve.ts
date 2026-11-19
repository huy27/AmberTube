// Chart song → playable YouTube Track, through the existing search service. Cached so a song is looked up once.
import type { ChartTrack, Track } from '../types';
import { hasYouTubeApi, searchMusic, searchVideos } from '../services/youtube';
import { pickBestMatch } from './match';

const KEY = 'ambertube:chart-match:v1';
const HIT_TTL = 7 * 24 * 3600_000;
const MISS_TTL = 3600_000; // a miss is retried later (new uploads, transient errors don't count as misses)
const MAX = 300;

type Entry = { at: number; track: Track | null };
let store: Record<string, Entry> | null = null;
const inflight = new Map<string, Promise<Track | null>>();

function load(): Record<string, Entry> {
  if (store) return store;
  try {
    store = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, Entry>;
  } catch {
    store = {};
  }
  return store;
}

function save(key: string, track: Track | null) {
  const s = load();
  s[key] = { at: Date.now(), track };
  const keys = Object.keys(s);
  if (keys.length > MAX) keys.sort((a, b) => s[a].at - s[b].at).slice(0, keys.length - MAX).forEach((k) => delete s[k]);
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota: keep in memory */
  }
}

/** Already-resolved YouTube track for a chart song (no network), or undefined when unknown / expired. */
export function cachedMatch(c: ChartTrack): Track | null | undefined {
  const e = load()[c.key];
  if (!e) return undefined;
  if (Date.now() - e.at > (e.track ? HIT_TTL : MISS_TTL)) return undefined;
  return e.track;
}

/** The YouTube query for a chart song: artist + title, as the user would type it. */
export const chartQuery = (c: Pick<ChartTrack, 'artist' | 'title'>) => `${c.artist} - ${c.title}`;

/**
 * Finds the YouTube upload of a chart song: Music-category search when the Data API is configured (official
 * audio / Topic uploads rank there), the regular search otherwise. Returns null when no result is that song;
 * throws on network/API errors (those are not cached). Concurrent calls for one song share a request.
 */
export function resolveChartTrack(c: ChartTrack): Promise<Track | null> {
  const hit = cachedMatch(c);
  if (hit !== undefined) return Promise.resolve(hit);
  const pending = inflight.get(c.key);
  if (pending) return pending;
  const p = (async () => {
    const q = chartQuery(c);
    let results = hasYouTubeApi ? await searchMusic(q) : (await searchVideos(q)).items;
    if (hasYouTubeApi && results.length === 0) results = (await searchVideos(q)).items; // nothing tagged Music
    const best = pickBestMatch(c, results);
    save(c.key, best);
    return best;
  })().finally(() => inflight.delete(c.key));
  inflight.set(c.key, p);
  return p;
}
