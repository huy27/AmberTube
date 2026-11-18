// Demo catalogue used when no YouTube API key is configured.
// Tracks play through a simulated clock so the whole UI can be exercised offline.
// `license` drives MP3 eligibility: 'owned' and 'cc-by' are convertible, 'standard' is not.
import type { License, SceneArtSpec, Track } from '../types';
import { genresOf } from '../recommend/style.ts';

const t = (
  id: string,
  title: string,
  channel: string,
  views: number,
  duration: number,
  art: SceneArtSpec,
  license: License,
  tags: string[],
  extra: Partial<Track> = {},
): Track => ({
  id: `demo:${id}`,
  provider: 'demo',
  title,
  channel,
  channelId: `demo-${channel.toLowerCase().replace(/[^a-z]+/g, '-')}`,
  views,
  duration,
  isLive: false,
  art,
  license,
  tags,
  genres: genresOf({ title, tags }),
  ...extra,
});

export const DEMO_TRACKS: Track[] = [
  t('01', 'Lofi Hip Hop Radio – Beats to relax/study to', 'Amber Sessions', 14_200_000, 13512, { variant: 'desk', hue: 18 }, 'owned', ['lofi', 'hip hop', 'study', 'beats', 'chill', 'relaxing', 'focus']),
  t('02', 'Lo-fi Hip Hop Beats – Rooftop Radio', 'Amber Sessions', 9_800_000, 13512, { variant: 'city', hue: 265 }, 'owned', ['lofi', 'hip hop', 'beats', 'city']),
  t('03', 'Lofi Hip Hop Beats – Window Seat', 'Night Owl Tapes', 6_400_000, 13512, { variant: 'window', hue: 190 }, 'cc-by', ['lofi', 'hip hop', 'beats', 'study', 'focus']),
  t('04', 'Lofi Hip Hop Beats – Relaxing Harbour', 'Night Owl Tapes', 4_100_000, 13512, { variant: 'sea', hue: 290 }, 'owned', ['lofi', 'relax', 'relaxing', 'beats', 'hip hop']),
  t('15', 'Lofi Hip Hop Beats – Rainy Platform', 'Platform Nine', 3_000_000, 10800, { variant: 'rain', hue: 250 }, 'standard', ['lofi', 'hip hop', 'beats', 'rain'], { unavailable: true }),
  t('05', 'Lofi Hip Hop Beats – relaxing (late shift)', 'Kettle & Rain', 2_300_000, 13512, { variant: 'desk', hue: 28 }, 'standard', ['lofi', 'relax', 'relaxing', 'hip hop', 'beats']),
  t('06', 'Lofi Hip Hop Beats – relaxing (rainy edit)', 'Kettle & Rain', 1_700_000, 13512, { variant: 'rain', hue: 210 }, 'cc-by', ['lofi', 'rain', 'relax', 'relaxing', 'hip hop', 'beats']),
  t('07', 'Sunset Groove', 'Ambient Waves', 820_000, 270, { variant: 'sea', hue: 22 }, 'owned', ['ambient', 'sunset', 'groove', 'chill', 'relaxing', 'happy']),
  t('08', 'Tidal Hum', 'Ambient Waves', 410_000, 312, { variant: 'sea', hue: 200 }, 'owned', ['ambient', 'ocean', 'calm', 'sleep', 'relaxing']),
  t('09', 'Neon Commute', 'Grid Runner', 1_200_000, 245, { variant: 'city', hue: 320 }, 'cc-by', ['synthwave', 'retro', 'night', 'drive', 'workout', 'energy']),
  t('10', 'Midnight Overpass', 'Grid Runner', 980_000, 288, { variant: 'city', hue: 240 }, 'owned', ['synthwave', 'night', 'drive', 'deep work', 'focus']),
  t('11', 'Pine Cabin Mornings', 'Field Notes', 530_000, 198, { variant: 'window', hue: 120 }, 'owned', ['acoustic', 'morning', 'folk', 'calm', 'happy', 'guitar']),
  t('12', 'Paper Lanterns', 'Field Notes', 260_000, 224, { variant: 'rain', hue: 35 }, 'standard', ['acoustic', 'piano', 'calm', 'sad']),
  t('13', 'Deep Focus – Piano & Rain', 'Quiet Hours', 3_300_000, 3600, { variant: 'rain', hue: 230 }, 'owned', ['focus', 'piano', 'rain', 'study', 'deep work', 'sleep']),
  t('14', 'Coffee Shop Jazz – Warm Afternoon', 'Quiet Hours', 2_900_000, 5400, { variant: 'desk', hue: 40 }, 'cc-by', ['jazz', 'coffee', 'cafe', 'chill', 'happy']),
  t('16', 'Rain on the Tin Roof – 3 Hours', 'Quiet Hours', 5_100_000, 10800, { variant: 'rain', hue: 205 }, 'owned', ['rain', 'rain sounds', 'sleep', 'relaxing', 'nature']),
  t('17', 'Iron & Echo – Gym Session', 'Pulse Lab', 760_000, 1820, { variant: 'city', hue: 5 }, 'owned', ['workout', 'gym', 'energy', 'edm', 'running']),
  t('18', 'Morning Confetti', 'Pulse Lab', 430_000, 192, { variant: 'window', hue: 50 }, 'cc-by', ['happy', 'pop', 'upbeat', 'morning']),
  t('19', 'Letters I Kept', 'Field Notes', 310_000, 236, { variant: 'rain', hue: 220 }, 'owned', ['sad', 'piano', 'acoustic', 'slow']),
  t('20', 'Soft Static – Sleep Drone', 'Ambient Waves', 1_400_000, 7200, { variant: 'sea', hue: 250 }, 'owned', ['sleep', 'ambient', 'drone', 'calm']),
];

export interface Mood {
  id: string;
  label: string;
  query: string;
  hue: number;
}

export const MOODS: Mood[] = [
  { id: 'lofi', label: 'Lo-fi', query: 'lofi hip hop', hue: 265 },
  { id: 'relaxing', label: 'Thư giãn', query: 'relaxing music', hue: 190 },
  { id: 'focus', label: 'Tập trung', query: 'focus music', hue: 32 },
  { id: 'deep-work', label: 'Làm việc sâu', query: 'deep work music', hue: 225 },
  { id: 'rain', label: 'Tiếng mưa', query: 'rain sounds', hue: 205 },
  { id: 'sleep', label: 'Ngủ ngon', query: 'sleep music', hue: 250 },
  { id: 'workout', label: 'Tập luyện', query: 'workout music', hue: 5 },
  { id: 'happy', label: 'Vui vẻ', query: 'happy music', hue: 45 },
  { id: 'sad', label: 'Buồn', query: 'sad songs', hue: 215 },
  { id: 'acoustic', label: 'Acoustic', query: 'acoustic songs', hue: 120 },
  { id: 'english', label: 'Nhạc tiếng Anh', query: 'top english songs', hue: 340 },
];

const STOP_WORDS = new Set(['music', 'songs', 'song', 'mix', 'playlist', 'lo', 'fi', 'the', 'and', 'to']);

export function searchDemo(query: string): Track[] {
  const q = query.toLowerCase();
  const words = q.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  const flatQ = q.replace(/[^a-z]/g, '');
  const scored = DEMO_TRACKS.map((tr) => {
    const tags = tr.tags ?? [];
    const hay = `${tr.title} ${tr.channel} ${tags.join(' ')}`.toLowerCase();
    let score = 0;
    if (flatQ.includes('lofi') && hay.replace(/[^a-z]/g, '').includes('lofi')) score += 3;
    for (const w of words) {
      if (tags.includes(w)) score += 2;
      else if (new RegExp(`\\b${w}`).test(hay)) score += 1;
    }
    // multi-word tags such as "deep work" or "rain sounds"
    for (const tag of tags) if (tag.includes(' ') && q.includes(tag)) score += 3;
    return { tr, score };
  });
  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.tr);
  return hits.length ? hits : DEMO_TRACKS.slice(0, 6);
}
