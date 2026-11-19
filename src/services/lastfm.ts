// Last.fm (charts only — Last.fm has no playable audio). Popular artists in Vietnam via geo.getTopArtists.
// The key comes from VITE_LASTFM_API_KEY. AmberTube has no backend, so the key is used from the browser
// (like the YouTube key); Last.fm API keys are read-only and only identify the app.
import { normalizeTopArtists, pickImage, type ArtistPage, type RawTopArtists } from '../artists/normalize';
import { normalizeTopTracks, type ChartPage, type RawTopTracks } from '../charts/normalize';
import type { ChartSource } from '../types';

const API_KEY = import.meta.env.VITE_LASTFM_API_KEY;
const ENDPOINT = 'https://ws.audioscrobbler.com/2.0/';
const CACHE_KEY = 'ambertube:lastfm-top:v1';
const TTL = 8 * 3600_000; // charts change slowly
const TIMEOUT = 10_000;

export const hasLastfmApi = Boolean(API_KEY);
/** Last.fm wants the ISO 3166-1 short name: "Viet Nam" ("Vietnam" → error 6 "country param invalid"). */
export const TOP_COUNTRY = 'Viet Nam';

export type LastfmErrorKind = 'rate-limit' | 'auth' | 'invalid' | 'network' | 'server' | 'no-key';
export class LastfmError extends Error {
  constructor(message: string, readonly kind: LastfmErrorKind, readonly code?: number) {
    super(message);
  }
}

type CacheEntry = { at: number; data: unknown };
function readCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}
function writeCache(key: string, data: unknown) {
  const all = readCache();
  all[key] = { at: Date.now(), data };
  const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at).slice(0, 24); // a few pages per chart only
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(keys.map((k) => [k, all[k]]))));
  } catch {
    /* storage full: still works without cache */
  }
}

const inflight = new Map<string, Promise<unknown>>();

/** One Last.fm GET with timeout, error mapping and a single retry for transient failures. */
async function call<T>(params: Record<string, string>, parse: (data: unknown) => T): Promise<T> {
  const qs = new URLSearchParams({ ...params, api_key: API_KEY!, format: 'json' });
  const attempt = async (): Promise<T> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    let res: Response;
    try {
      res = await fetch(`${ENDPOINT}?${qs}`, { signal: ctrl.signal });
    } catch {
      if (ctrl.signal.aborted) throw new LastfmError('Last.fm phản hồi quá chậm. Thử lại sau.', 'network');
      throw new LastfmError('Không kết nối được Last.fm. Kiểm tra mạng rồi thử lại.', 'network');
    } finally {
      clearTimeout(timer);
    }
    const data = (await res.json().catch(() => ({}))) as { error?: number };
    if (data.error === 29 || res.status === 429) throw new LastfmError('Last.fm đang giới hạn số lượt gọi. Thử lại sau ít phút.', 'rate-limit', 29);
    if (data.error === 10 || data.error === 26 || data.error === 4) throw new LastfmError('API key Last.fm không hợp lệ hoặc đã bị khóa.', 'auth', data.error);
    // 6 = invalid parameters: a request bug, retrying cannot help
    if (data.error === 6) throw new LastfmError('Yêu cầu tới Last.fm không hợp lệ.', 'invalid', 6);
    if (!res.ok || data.error) throw new LastfmError(`Last.fm đang gặp lỗi (${data.error ?? res.status}).`, 'server', data.error ?? res.status);
    return parse(data);
  };
  try {
    return await attempt();
  } catch (e) {
    // one retry for transient failures only (never for rate limits or a bad key)
    if (e instanceof LastfmError && (e.kind === 'network' || e.kind === 'server')) {
      await new Promise((r) => setTimeout(r, 800));
      return attempt();
    }
    throw e;
  }
}

/** Cached (per key, `ttl`), de-duplicated call; a stale cached copy is returned if Last.fm then fails. */
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  if (!API_KEY) throw new LastfmError('Chưa cấu hình VITE_LASTFM_API_KEY.', 'no-key');
  const hit = readCache()[key] as { at: number; data: T } | undefined;
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const p = load()
    .then((data) => {
      writeCache(key, data);
      return data;
    })
    .catch((e) => {
      if (hit) return hit.data; // stale beats nothing
      throw e;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Top artists in a country, one Last.fm page (cached ~8 h). */
export function getTopArtists({ page = 1, limit = 50, country = TOP_COUNTRY }: { page?: number; limit?: number; country?: string } = {}): Promise<ArtistPage> {
  return cached(`artists|${country}|${limit}|${page}`, TTL, () =>
    call({ method: 'geo.gettopartists', country, limit: String(limit), page: String(page) }, (d) => normalizeTopArtists(d as RawTopArtists, page, limit)));
}

const CHART_TTL = 45 * 60_000; // track charts move faster than artist charts

/** Popular tracks: `vietnam` = geo.getTopTracks (country Vietnam), `global` = chart.getTopTracks. Cached ~45 min. */
export function getTopTracks({ source, page = 1, limit = 50 }: { source: ChartSource; page?: number; limit?: number }): Promise<ChartPage> {
  const params: Record<string, string> = source === 'vietnam'
    ? { method: 'geo.gettoptracks', country: TOP_COUNTRY, limit: String(limit), page: String(page) }
    : { method: 'chart.gettoptracks', limit: String(limit), page: String(page) };
  return cached(`tracks|${source}|${limit}|${page}`, CHART_TTL, () => call(params, (d) => normalizeTopTracks(d as RawTopTracks, page, limit, source)));
}

/**
 * Album cover of a song (track.getInfo, autocorrected). Chart responses only carry Last.fm's blank star
 * image, but album art is still served. Null when Last.fm doesn't know the track or has no cover.
 */
export async function getTrackArt(artist: string, title: string): Promise<string | null> {
  if (!API_KEY) return null;
  try {
    return await call({ method: 'track.getinfo', artist, track: title, autocorrect: '1' },
      (d) => pickImage((d as { track?: { album?: { image?: { '#text'?: string; size?: string }[] } } }).track?.album?.image));
  } catch (e) {
    if (e instanceof LastfmError && e.code === 6) return null; // "Track not found"
    throw e;
  }
}
