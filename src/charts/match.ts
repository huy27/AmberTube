// Pick the YouTube upload that IS this chart song. Pure (unit-tested).
import type { ChartTrack, Track } from '../types.ts';
import { info, sameArtist } from '../recommend/identity.ts';
import { normalize } from '../search/normalize.ts';

/** The chart song described as a Track, so it goes through the same identity rules as YouTube uploads. */
const asTrack = (c: Pick<ChartTrack, 'title' | 'artist'>): Track => ({
  id: `chart:${c.artist}|${c.title}`, provider: 'youtube', title: `${c.artist} - ${c.title}`, channel: `${c.artist} - Topic`,
  channelId: null, views: null, duration: 0, isLive: false, license: 'standard', tags: [],
});

const titleMatches = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)));

/**
 * Best YouTube result for a chart track, or null when none is the same song.
 * Requires: same title, same artist (channel, title or Topic) and the same version
 * (an original never resolves to a remix/live/cover/karaoke). Prefers Topic › official audio › official MV.
 */
export function pickBestMatch(c: Pick<ChartTrack, 'title' | 'artist'>, candidates: Track[]): Track | null {
  const want = info(asTrack(c));
  const artistN = normalize(c.artist);
  let best: { t: Track; score: number } | null = null;
  for (const t of candidates) {
    if (t.unavailable || t.isLive) continue;
    const got = info(t);
    if (got.version !== want.version) continue;
    const titleN = normalize(t.title);
    // "TITLE | OFFICIAL MV | ARTIST" uploads parse with artist/title swapped — accept either side.
    const exact = got.title === want.title || got.artist === want.title;
    if (!exact && !titleMatches(got.title, want.title) && !titleMatches(got.artist, want.title)) continue;
    const channelN = normalize(t.channel.replace(/\s*-\s*topic$/i, ''));
    const artistOk = sameArtist(got, want) || got.title === artistN || channelN.includes(artistN) || titleN.includes(artistN);
    if (!artistOk) continue;
    let score = exact ? 3 : 1.5;
    if (/-\s*topic$/i.test(t.channel)) score += 3;
    if (/official audio/.test(titleN)) score += 2;
    else if (/official (music )?video|official mv|\bmv\b/.test(titleN)) score += 1.5;
    if (/lyric|vietsub|loi bai hat/.test(titleN)) score -= 0.5;
    if (t.duration > 0 && (t.duration < 60 || t.duration > 15 * 60)) score -= 3; // clips, hour-long mixes
    score += Math.log10((t.views ?? 0) + 1) / 20;
    if (!best || score > best.score) best = { t, score };
  }
  return best?.t ?? null;
}
