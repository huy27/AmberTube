// Last.fm geo.getTopTracks / chart.getTopTracks → ChartTrack. Pure (unit-tested with Node).
import type { ChartSource, ChartTrack } from '../types.ts';
import { pickImage } from '../artists/normalize.ts';
import { normalize } from '../search/normalize.ts';

interface RawTrack {
  name?: string; url?: string; listeners?: string | number; playcount?: string | number; mbid?: string;
  artist?: { name?: string; '#text'?: string } | string; image?: { '#text'?: string; size?: string }[];
}
export interface RawTopTracks {
  tracks?: { track?: RawTrack[] | RawTrack; '@attr'?: { page?: string; perPage?: string; totalPages?: string; total?: string } };
  error?: number; message?: string;
}
export interface ChartPage { tracks: ChartTrack[]; page: number; totalPages: number; total: number }

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export const chartKey = (artist: string, title: string) => `${normalize(artist)}|${normalize(title)}`;

export function normalizeTrack(raw: RawTrack, rank: number, source: ChartSource): ChartTrack | null {
  const title = raw.name?.trim();
  const artist = (typeof raw.artist === 'string' ? raw.artist : raw.artist?.name ?? raw.artist?.['#text'])?.trim();
  if (!title || !artist) return null;
  return {
    key: chartKey(artist, title),
    title, artist,
    image: pickImage(raw.image),
    url: raw.url && /^https:\/\//.test(raw.url) ? raw.url : null,
    listeners: num(raw.listeners),
    playcount: num(raw.playcount),
    rank, source,
  };
}

/** Rank = position in the chart (offset + index + 1): geo ranks are 0-based and chart ranks are absent. */
export function normalizeTopTracks(data: RawTopTracks, page: number, limit: number, source: ChartSource): ChartPage {
  const t = data.tracks;
  const list = Array.isArray(t?.track) ? t!.track : t?.track ? [t.track] : [];
  const offset = (page - 1) * limit;
  const tracks = list.map((r, i) => normalizeTrack(r, offset + i + 1, source)).filter((x): x is ChartTrack => x !== null);
  const attr = t?.['@attr'];
  return { tracks, page: num(attr?.page) ?? page, totalPages: num(attr?.totalPages) ?? page, total: num(attr?.total) ?? tracks.length };
}

/** Merge a new page: keep order, drop repeats (same artist + title). */
export function mergeChartTracks(current: ChartTrack[], next: ChartTrack[]): ChartTrack[] {
  const seen = new Set(current.map((c) => c.key));
  return [...current, ...next.filter((c) => !seen.has(c.key) && (seen.add(c.key), true))];
}
