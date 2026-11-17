// Song identity: the same song uploaded as Official Audio / MV / Lyrics / Topic / re-upload
// maps to one identity, while genuinely different versions (remix, live, acoustic, cover…) stay distinct.
import type { Track } from '../types.ts';
import { editDistance, normalize } from '../search/normalize.ts';

export type Version = 'original' | 'remix' | 'live' | 'acoustic' | 'cover' | 'instrumental' | 'extended' | 'remaster' | 'karaoke' | 'sped-up' | 'slowed' | 'lofi-edit';

export interface SongInfo {
  /** normalized primary artist ('' when unknown) */
  artist: string;
  /** artist as written (for display) */
  artistDisplay: string;
  /** normalized featured / collaborating artists */
  featuring: string[];
  /** normalized song title without artist, version and upload noise */
  title: string;
  version: Version;
  /** stable key: artist|title|version (artist may be '' → title-only key) */
  key: string;
  durationSec: number;
}

// Upload noise that does NOT change which song it is
const NOISE = [
  'official music video', 'official video', 'official audio', 'official lyric video', 'official lyrics video', 'official visualizer', 'official mv',
  'music video', 'lyric video', 'lyrics video', 'video lyrics', 'audio only', 'official', 'audio', 'lyrics', 'lyric', 'visualizer', 'mv', 'm v',
  'video', 'hd', 'hq', '4k', '1080p', '720p', 'with lyrics', 'loi bai hat', 'vietsub', 'engsub', 'eng sub', 'viet sub', 'full', 'clip', 'new',
  'premiere', 'teaser', 'out now', 'free download',
];
// Words that DO make it a different version
const VERSIONS: [Version, RegExp][] = [
  ['karaoke', /\bkaraoke\b|\bbeat\b(?! it)/],
  ['instrumental', /\binstrumental\b|\bpiano version\b/],
  ['sped-up', /\bsped up\b|\bspeed up\b|\bnightcore\b/],
  ['slowed', /\bslowed\b|\breverb\b/],
  ['lofi-edit', /\blofi (ver|version|remix|edit)\b|\blo fi (ver|version)\b/],
  ['remix', /\bremix\b|\bmix\b(?= by)|\bbootleg\b|\bflip\b|\bvinahouse\b|\bedm (ver|version)\b/],
  ['live', /\blive\b|\bconcert\b|\blive session\b|\bat the\b.*\bshow\b/],
  ['acoustic', /\bacoustic\b|\bunplugged\b|\bstripped\b/],
  ['cover', /\bcover\b|\bcovered by\b/],
  ['extended', /\bextended\b/],
  ['remaster', /\bremaster(ed)?\b/],
];
const CHANNEL_NOISE = /\s*(-\s*topic|vevo|official|offical|channel|music|entertainment|records|tv)\s*$/i;
const FEAT = /\s(?:feat\.?|ft\.?|featuring|x|&|với|with)\s/i;
const DASH = /\s[-–—|]\s/;

const stripBrackets = (s: string) => s.replace(/[([{【「].*?[)\]}】」]/g, ' ');

function bracketText(s: string): string {
  return (s.match(/[([{【「](.*?)[)\]}】」]/g) || []).join(' ');
}

export function cleanArtist(name: string): string {
  let n = name.replace(CHANNEL_NOISE, '').replace(CHANNEL_NOISE, '');
  n = n.split(FEAT)[0];
  return normalize(n);
}

function stripNoise(normTitle: string): string {
  let t = ` ${normTitle} `;
  for (const n of NOISE) t = t.replace(new RegExp(` ${n} `, 'g'), ' ');
  return t.replace(/\s+/g, ' ').trim();
}

export function classifyVersion(title: string): Version {
  const t = normalize(title);
  for (const [v, re] of VERSIONS) if (re.test(t)) return v;
  return 'original';
}

/** Parse what song a track is, from title + channel (+ duration). */
export function songInfo(t: Track): SongInfo {
  const raw = t.title;
  const version = classifyVersion(raw);
  const channelArtist = /-\s*topic$/i.test(t.channel) ? cleanArtist(t.channel) : '';
  let artistPart = '';
  let titlePart = raw;
  const noBrackets = stripBrackets(raw);
  if (DASH.test(noBrackets)) {
    const [a, ...rest] = noBrackets.split(DASH);
    artistPart = a;
    titlePart = rest.join(' ');
  } else titlePart = noBrackets;
  // featuring artists can appear in the artist part or the title part
  const featRaw = `${artistPart} ${titlePart} ${bracketText(raw)}`.match(/(?:feat\.?|ft\.?|featuring)\s+([^()[\]\-–|]+)/i)?.[1] ?? '';
  const artistNames = artistPart.split(FEAT).map(normalize).filter(Boolean);
  let artist = channelArtist || artistNames[0] || '';
  // short stage name in the title, full name on the artist's own channel ("Đen x Chi Pu - …" on "Đen Vâu Official")
  const ch0 = cleanArtist(t.channel);
  let fromChannel = false;
  if (artist && !channelArtist && ch0 !== artist && ch0.startsWith(artist + ' ') && ch0.split(' ').length <= 4) {
    artist = ch0;
    fromChannel = true;
  }
  if (!artist && t.provider === 'demo') artist = cleanArtist(t.channel);
  if (!artist) {
    // channel named after an artist ("Sơn Tùng M-TP Official") is a reasonable artist guess
    const ch = cleanArtist(t.channel);
    if (ch && ch.split(' ').length <= 4 && !/lyric|vietsub|nhac|music|lofi|radio|playlist|hub|cover/.test(ch)) artist = ch;
  }
  const featuring = [...new Set([...artistNames.slice(1), ...featRaw.split(/,|&|\sx\s|\sand\s/i).map(normalize)].filter((a) => a && a !== artist))];
  let title = stripNoise(normalize(titlePart.replace(/(?:feat\.?|ft\.?|featuring)\s+.*$/i, '')));
  // remove version words from the core title so "Song (Remix)" keys as "song|remix"
  title = title.replace(/\b(remix|live|acoustic|cover|instrumental|extended( version| mix)?|remaster(ed)?|karaoke|beat|sped up|slowed|reverb|version|ver)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (artist && title.startsWith(artist + ' ')) title = title.slice(artist.length + 1);
  const key = `${artist}|${title}|${version}`;
  const artistDisplay = artist
    ? (/-\s*topic$/i.test(t.channel) ? t.channel.replace(/\s*-\s*topic$/i, '') : artistPart && !fromChannel ? artistPart.split(FEAT)[0].trim() : t.channel.replace(CHANNEL_NOISE, '').trim()) || artist
    : '';
  return { artist, artistDisplay, featuring, title, version, key, durationSec: t.duration || 0 };
}

const cache = new WeakMap<Track, SongInfo>();
export function info(t: Track): SongInfo {
  let s = cache.get(t);
  if (!s) {
    s = songInfo(t);
    cache.set(t, s);
  }
  return s;
}

function similarText(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // "Part 1" vs "Part 2", "Bài 3" vs "Bài 5": different numbers are different songs
  if ((a.match(/\d+/g) ?? []).join(',') !== (b.match(/\d+/g) ?? []).join(',')) return false;
  const short = Math.min(a.length, b.length);
  if (short >= 6 && (a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 4) return true;
  return short >= 8 && editDistance(a, b, 2) <= (short >= 12 ? 2 : 1); // typo-level differences only
}

export function sameArtist(a: SongInfo, b: SongInfo): boolean {
  if (!a.artist || !b.artist) return false;
  return similarText(a.artist, b.artist) || a.artist.includes(b.artist) || b.artist.includes(a.artist);
}

/**
 * Same underlying song? Requires the same version class, a matching title and — when known — a matching
 * artist and a compatible duration. Conservative on purpose: different songs must never be merged.
 */
export function isSameSong(x: Track, y: Track): boolean {
  if (x.id === y.id) return true;
  const a = info(x);
  const b = info(y);
  if (a.version !== b.version) return false;
  if (!similarText(a.title, b.title)) return false;
  const artistsKnown = Boolean(a.artist && b.artist);
  if (artistsKnown && !sameArtist(a, b)) return false;
  if (a.durationSec && b.durationSec) {
    // music videos often add an intro/outro; anything beyond ~35s is probably a different recording
    const diff = Math.abs(a.durationSec - b.durationSec);
    if (diff > Math.max(35, Math.min(a.durationSec, b.durationSec) * 0.15)) return false;
  } else if (!artistsKnown) return false;
  if (!artistsKnown && !(a.artist || b.artist)) return a.title.length >= 8; // title-only match must be specific
  return true;
}

/** Prefer the clean audio upload: Topic > official audio > official video > others; then views. */
function representativeScore(t: Track): number {
  const n = normalize(t.title);
  let s = 0;
  if (/-\s*topic$/i.test(t.channel)) s += 4;
  if (/official audio/.test(n)) s += 3;
  if (/official (music )?video|official mv/.test(n)) s += 2;
  if (/lyric|vietsub|loi bai hat/.test(n)) s -= 1;
  if (t.unavailable) s -= 10;
  return s + Math.log10((t.views ?? 0) + 1) / 10;
}

/** Collapse multiple uploads of the same song into one representative (order of first appearance kept). */
export function dedupeSongs(tracks: Track[]): Track[] {
  const groups: Track[][] = [];
  const byKey = new Map<string, Track[]>();
  for (const t of tracks) {
    const k = info(t);
    const bucketKey = `${k.title}|${k.version}`;
    const bucket = byKey.get(bucketKey) ?? [];
    const g = bucket.length ? groups.find((grp) => grp.some((x) => isSameSong(x, t))) : undefined;
    if (g) g.push(t);
    else {
      const ng = [t];
      groups.push(ng);
      bucket.push(t);
      byKey.set(bucketKey, bucket);
    }
  }
  return groups.map((g) => g.reduce((best, t) => (representativeScore(t) > representativeScore(best) ? t : best), g[0]));
}

export const containsSong = (list: Track[], t: Track) => list.some((x) => isSameSong(x, t));

/**
 * "Bài hát" vs "Video" filter on search results. A song: YouTube Music category, an auto-generated
 * "- Topic" upload, or an "Artist - Title" / official audio/MV upload of normal song length.
 * Everything else (live streams, hour-long mixes, vlogs, talk shows…) is a video.
 */
export function isSongLike(t: Track): boolean {
  if (t.isLive) return false;
  const d = t.duration || 0;
  if (d && (d < 60 || d > 15 * 60)) return false;
  if (t.categoryId) return t.categoryId === '10';
  if (/-\s*topic$/i.test(t.channel)) return true;
  if (/official (audio|music video|video|mv)|\blyrics?\b|\bmv\b|\baudio\b/i.test(t.title)) return true;
  if (DASH.test(stripBrackets(t.title))) return true;
  return t.provider !== 'youtube'; // demo / local tracks are songs unless they are long mixes
}
