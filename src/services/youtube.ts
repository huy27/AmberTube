import { recordQuota, type QuotaKind } from './quota';
import type { Track } from '../types';
import { decodeEntities, parseIsoDuration, parseYouTubeId } from './format';
import { searchDemo, DEMO_TRACKS } from '../data/demoCatalog';
import { normalize } from '../search/normalize';
import { genresOf } from '../recommend/style';

const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
const API = 'https://www.googleapis.com/youtube/v3';

/** every YouTube Data API call goes through here so the quota estimate stays accurate */
function ytFetch(kind: QuotaKind, params: URLSearchParams, signal?: AbortSignal): Promise<Response> {
  recordQuota(kind);
  return fetch(`${API}/${kind}?${params}`, { signal });
}

export const hasYouTubeApi = Boolean(API_KEY);
export const PASTED_CHANNEL = 'Link đã dán';

export interface SearchResult {
  items: Track[];
  nextPageToken: string | null;
  source: 'youtube' | 'demo' | 'link';
}

interface VideoResource {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    channelId?: string;
    liveBroadcastContent?: string;
    thumbnails?: Record<string, { url: string }>;
    tags?: string[];
    categoryId?: string;
    defaultAudioLanguage?: string;
    defaultLanguage?: string;
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
  status?: { license?: string };
}

function fromVideoResource(v: VideoResource): Track {
  const sn = v.snippet || {};
  const live = sn.liveBroadcastContent === 'live';
  return {
    id: `yt:${v.id}`,
    provider: 'youtube',
    videoId: v.id,
    title: decodeEntities(sn.title || 'Video không có tiêu đề'),
    channel: decodeEntities(sn.channelTitle || ''),
    channelId: sn.channelId ?? null,
    views: Number(v.statistics?.viewCount ?? NaN),
    duration: live ? 0 : parseIsoDuration(v.contentDetails?.duration),
    isLive: live,
    thumbnail: sn.thumbnails?.medium?.url || sn.thumbnails?.high?.url || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
    license: v.status?.license === 'creativeCommon' ? 'cc-by' : 'standard',
    // metadata used by recommendations (uploader tags → approximate genres; declared language)
    genres: genresOf({ title: decodeEntities(sn.title || ''), tags: (sn.tags || []).slice(0, 25) }),
    lang: (sn.defaultAudioLanguage || sn.defaultLanguage || '').slice(0, 2).toLowerCase() || undefined,
    categoryId: sn.categoryId,
  };
}

/** A track built from a pasted URL/id when no API key is available. */
export function trackFromVideoId(videoId: string): Track {
  return {
    id: `yt:${videoId}`,
    provider: 'youtube',
    videoId,
    title: 'Video YouTube',
    channel: PASTED_CHANNEL,
    channelId: null,
    views: NaN,
    duration: 0,
    isLive: false,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    license: 'standard',
  };
}

async function fetchVideos(ids: string[], signal?: AbortSignal): Promise<Track[]> {
  const params = new URLSearchParams({ part: 'snippet,contentDetails,statistics,status', id: ids.join(','), key: API_KEY! });
  const res = await ytFetch('videos', params, signal);
  if (!res.ok) throw new Error(`Lỗi YouTube API (${res.status})`);
  const data: { items?: VideoResource[] } = await res.json();
  const byId = new Map((data.items || []).map((v) => [v.id, fromVideoResource(v)]));
  return ids.map((id) => byId.get(id)).filter((t): t is Track => Boolean(t));
}

// ---- result cache: avoids repeat API calls (quota) and feeds autocomplete ----
const CACHE_KEY = 'ambertube:search-cache';
const CACHE_TTL = 12 * 3600_000;
const CACHE_MAX = 25;
interface CacheEntry { q: string; at: number; result: SearchResult }
let cache: CacheEntry[] = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]') as CacheEntry[];
    return Array.isArray(raw) ? raw.filter((e) => e && Date.now() - e.at < CACHE_TTL) : [];
  } catch {
    return [];
  }
})();
const inflight = new Map<string, Promise<SearchResult>>();
const cacheKey = (q: string) => normalize(q);

function remember(q: string, result: SearchResult) {
  if (result.source === 'demo') return; // the demo catalogue is always available locally
  const key = cacheKey(q);
  cache = [{ q, at: Date.now(), result }, ...cache.filter((e) => cacheKey(e.q) !== key)].slice(0, CACHE_MAX);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota exceeded: keep the in-memory cache only */
  }
}

/** Tracks from cached searches (most recent first), for suggestions and recommendations. */
export function getCachedTracks(): Track[] {
  return cache.flatMap((e) => e.result.items);
}
export function getCachedQueries(): string[] {
  return cache.map((e) => e.q).filter((q) => !q.startsWith('♪ '));
}

/** Search YouTube (or the demo catalogue when no key is set). Identical concurrent requests share one call. */
export async function searchVideos(query: string, opts: { pageToken?: string | null; signal?: AbortSignal } = {}): Promise<SearchResult> {
  const { pageToken } = opts;
  if (!pageToken) {
    const key = cacheKey(query);
    const hit = cache.find((e) => cacheKey(e.q) === key && Date.now() - e.at < CACHE_TTL);
    if (hit) return hit.result;
    const pending = inflight.get(key);
    if (pending) return pending;
    // the shared request isn't tied to one caller's AbortSignal
    const p = searchUncached(query, {}).then((r) => {
      remember(query, r);
      return r;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return opts.signal ? abortable(p, opts.signal) : p;
  }
  return searchUncached(query, opts);
}

function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    p.then(resolve, reject);
  });
}

/** Most popular music videos from the official API (videos.list chart=mostPopular, 1 quota unit), cached 6h. */
export async function getTrending(): Promise<{ items: Track[]; source: 'youtube' | 'demo' }> {
  if (!API_KEY) {
    return { items: [...DEMO_TRACKS].filter((t) => !t.unavailable).sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 10), source: 'demo' };
  }
  const KEY = 'ambertube:trending';
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null') as { at: number; items: Track[] } | null;
    if (c && Date.now() - c.at < 6 * 3600_000) return { items: c.items, source: 'youtube' };
  } catch {
    /* ignore */
  }
  const params = new URLSearchParams({ part: 'snippet,contentDetails,statistics,status', chart: 'mostPopular', videoCategoryId: '10', regionCode: 'VN', maxResults: '12', key: API_KEY });
  const res = await ytFetch('videos', params);
  if (!res.ok) throw new Error(`Lỗi YouTube API (${res.status})`);
  const data: { items?: VideoResource[] } = await res.json();
  const items = (data.items || []).map(fromVideoResource);
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), items }));
  } catch {
    /* ignore */
  }
  return { items, source: 'youtube' };
}

/**
 * Candidate search for recommendations: Music category only (videoCategoryId=10), embeddable videos.
 * Cached like normal searches (under a separate key) so repeated radio refills cost no extra quota.
 */
export async function searchMusic(query: string): Promise<Track[]> {
  if (!API_KEY) return [];
  const key = cacheKey(`♪ ${query}`);
  const hit = cache.find((e) => cacheKey(e.q) === key && Date.now() - e.at < CACHE_TTL);
  if (hit) return hit.result.items;
  const r = await searchUncached(query, { music: true });
  remember(`♪ ${query}`, r);
  return r.items;
}

async function searchUncached(query: string, opts: { pageToken?: string | null; signal?: AbortSignal; music?: boolean }): Promise<SearchResult> {
  const { pageToken, signal } = opts;
  const pastedId = parseYouTubeId(query);
  if (pastedId) {
    if (!API_KEY) return { items: [trackFromVideoId(pastedId)], nextPageToken: null, source: 'link' };
    return { items: await fetchVideos([pastedId], signal), nextPageToken: null, source: 'link' };
  }

  if (!API_KEY) {
    await new Promise((r) => setTimeout(r, 250)); // keep the loading state visible in demo mode
    return { items: searchDemo(query), nextPageToken: null, source: 'demo' };
  }

  const params = new URLSearchParams({ part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '15', q: query, key: API_KEY });
  if (pageToken) params.set('pageToken', pageToken);
  if (opts.music) params.set('videoCategoryId', '10');
  const res = await ytFetch('search', params, signal);
  if (!res.ok) throw new Error(`Lỗi YouTube API (${res.status})`);
  const data: { items?: { id?: { videoId?: string } }[]; nextPageToken?: string } = await res.json();
  const ids = (data.items || []).map((i) => i.id?.videoId).filter((x): x is string => Boolean(x));
  const items = ids.length ? await fetchVideos(ids, signal) : [];
  return { items, nextPageToken: data.nextPageToken || null, source: 'youtube' };
}

/** Channel pictures (channels.list, 1 quota unit for up to 50 channels). */
export async function getChannelThumbnails(ids: string[]): Promise<Record<string, string>> {
  if (!API_KEY || !ids.length) return {};
  const params = new URLSearchParams({ part: 'snippet', id: ids.slice(0, 50).join(','), key: API_KEY });
  const res = await ytFetch('channels', params);
  if (!res.ok) throw new Error(`Lỗi YouTube API (${res.status})`);
  const data: { items?: { id: string; snippet?: { thumbnails?: Record<string, { url?: string }> } }[] } = await res.json();
  const out: Record<string, string> = {};
  for (const c of data.items ?? []) {
    const th = c.snippet?.thumbnails;
    const url = th?.medium?.url || th?.high?.url || th?.default?.url;
    if (url?.startsWith('https://')) out[c.id] = url;
  }
  return out;
}

export const watchUrl = (track: Track): string | null =>
  track.provider === 'youtube' && track.videoId ? `https://www.youtube.com/watch?v=${track.videoId}` : null;
