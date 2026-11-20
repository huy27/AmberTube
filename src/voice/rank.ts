// Which search result to play for a spoken request (pure; unit-tested).
// YouTube's own order is the starting point; the song's official upload is preferred, and other versions
// (cover, karaoke, remix, live, slowed…) are pushed down unless the request asked for them.
import type { Track } from '../types.ts';
import { classifyVersion } from '../recommend/identity.ts';
import { normalize } from '../search/normalize.ts';

const VERSION_WORDS: Record<string, RegExp> = {
  karaoke: /\bkaraoke\b|\bbeat\b/, instrumental: /\binstrumental\b|\bpiano\b/, 'sped-up': /\bsped up\b|\bspeed up\b|\bnightcore\b/,
  slowed: /\bslowed\b|\breverb\b/, 'lofi-edit': /\blo ?fi\b/, remix: /\bremix\b|\bvinahouse\b|\bedm\b/, live: /\blive\b|\bconcert\b/,
  acoustic: /\bacoustic\b|\bunplugged\b/, cover: /\bcover\b/, extended: /\bextended\b/, remaster: /\bremaster/,
};

export function rankForVoice(query: string, tracks: Track[]): Track[] {
  const q = normalize(query);
  const words = q.split(' ').filter((w) => w.length > 1);
  const asked = Object.keys(VERSION_WORDS).find((v) => VERSION_WORDS[v].test(q)); // e.g. "… karaoke"

  const scored = tracks
    .filter((t) => !t.unavailable && !t.isLive && t.provider !== 'local')
    .map((t, i) => {
      const title = normalize(t.title);
      const hay = `${title} ${normalize(t.channel)}`;
      let s = Math.max(0, 10 - i); // YouTube's relevance order
      if (words.length) s += (4 * words.filter((w) => hay.includes(w)).length) / words.length;
      if (/ topic$/.test(normalize(t.channel))) s += 3;
      if (/official audio/.test(title)) s += 2;
      else if (/official (music )?video|official mv|\bmv\b/.test(title)) s += 1.5;
      const v = classifyVersion(t.title);
      if (asked ? v !== asked : v !== 'original') s -= 6; // the version that was asked for (default: the original)
      if (t.duration > 0 && (t.duration < 60 || t.duration > 20 * 60)) s -= 4; // clips, hour-long mixes
      return { t, s, i };
    });
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored.map((x) => x.t);
}
