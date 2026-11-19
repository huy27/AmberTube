// Last.fm geo.getTopArtists → internal Artist model. Pure (unit-tested with Node).
import type { Artist } from '../types.ts';

/** Last.fm has served this grey star for every artist image since 2019 — it is not a real photo. */
const PLACEHOLDER_HASH = '2a96cbd8b46e442fc41c2b86b821562f';

interface RawImage { '#text'?: string; size?: string }
export interface RawArtist {
  name?: string; mbid?: string; url?: string; listeners?: string | number; playcount?: string | number;
  image?: RawImage[]; '@attr'?: { rank?: string | number };
}
export interface RawTopArtists {
  topartists?: { artist?: RawArtist[] | RawArtist; '@attr'?: { page?: string; perPage?: string; totalPages?: string; total?: string; country?: string } };
  error?: number; message?: string;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Largest real image, or null (missing, empty or the Last.fm placeholder). */
export function pickImage(images: RawImage[] | undefined): string | null {
  if (!Array.isArray(images)) return null;
  const order = ['mega', 'extralarge', 'large', 'medium', 'small'];
  const sorted = [...images].sort((a, b) => order.indexOf(a.size ?? '') - order.indexOf(b.size ?? ''));
  for (const im of sorted) {
    const url = im['#text']?.trim();
    if (url && /^https:\/\//.test(url) && !url.includes(PLACEHOLDER_HASH)) return url;
  }
  return null;
}

export function normalizeArtist(raw: RawArtist, fallbackRank: number): Artist | null {
  const name = raw.name?.trim();
  if (!name) return null;
  return {
    name,
    mbid: raw.mbid?.trim() || null,
    url: raw.url && /^https:\/\//.test(raw.url) ? raw.url : null,
    image: pickImage(raw.image),
    listeners: num(raw.listeners),
    playcount: num(raw.playcount),
    rank: num(raw['@attr']?.rank) ?? fallbackRank,
  };
}

export interface ArtistPage { artists: Artist[]; page: number; totalPages: number; total: number }

export function normalizeTopArtists(data: RawTopArtists, page: number, limit: number): ArtistPage {
  const top = data.topartists;
  const list = Array.isArray(top?.artist) ? top!.artist : top?.artist ? [top.artist] : [];
  const offset = (page - 1) * limit;
  const artists = list.map((a, i) => normalizeArtist(a, offset + i + 1)).filter((a): a is Artist => a !== null);
  const attr = top?.['@attr'];
  return { artists, page: num(attr?.page) ?? page, totalPages: num(attr?.totalPages) ?? page, total: num(attr?.total) ?? artists.length };
}

/** Merge a new page into what is shown: keep order, drop repeats (Last.fm pages can overlap). */
export function mergeArtists(current: Artist[], next: Artist[]): Artist[] {
  const seen = new Set(current.map((a) => a.name.toLowerCase()));
  return [...current, ...next.filter((a) => !seen.has(a.name.toLowerCase()) && (seen.add(a.name.toLowerCase()), true))];
}
