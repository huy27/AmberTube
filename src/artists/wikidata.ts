// Artist photos from Wikidata / Wikimedia Commons (free licences, CORS-enabled, no key).
// Last.fm stopped serving artist pictures (every artist gets the same blank star), so the photo comes from
// the artist's Wikidata entry: matched by MusicBrainz ID when Last.fm has one, else by exact name — and only
// when that entry is a musician / music group. Ambiguous names get no photo rather than someone else's.
import { normalize } from '../search/normalize.ts';

export interface WdCandidate { id: string; label?: string; match?: string }
export interface WdFacts { music: boolean; vn: boolean; image: string | null }

/**
 * Which search result is this artist: exact name (label or matched alias), a musician or music group;
 * several such → the Vietnamese one (this is the Vietnam chart); still several → none.
 */
export function pickEntity(name: string, cands: WdCandidate[], facts: Record<string, WdFacts>): string | null {
  const n = normalize(name);
  const exact = cands.filter((c) => (normalize(c.label ?? '') === n || normalize(c.match ?? '') === n) && facts[c.id]?.music);
  const ids = [...new Set(exact.map((c) => c.id))];
  if (ids.length <= 1) return ids[0] ?? null;
  const vn = ids.filter((id) => facts[id].vn);
  return vn.length === 1 ? vn[0] : null;
}

/** Commons file name from a SPARQL P18 value ("http://commons.wikimedia.org/wiki/Special:FilePath/A%20B.jpg"). */
export const commonsFile = (v: string) => decodeURIComponent(v.split('/').pop() ?? '');
export const commonsThumb = (file: string, width = 320) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
export const commonsPage = (file: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;
