// Approximate musical style from available metadata (uploader tags, category, title words, demo genres)
// and language from the text. This is NOT audio analysis — when nothing is known we say so (empty set).
import type { Track } from '../types.ts';
import { normalize } from '../search/normalize.ts';

export const GENRE_LABEL: Record<string, string> = {
  lofi: 'lo-fi', chill: 'chill', hiphop: 'hip hop / rap', edm: 'EDM', synthwave: 'synthwave', rock: 'rock', metal: 'metal',
  jazz: 'jazz', classical: 'cổ điển', piano: 'piano', acoustic: 'acoustic', ballad: 'ballad', pop: 'pop', vpop: 'V-pop', kpop: 'K-pop',
  bolero: 'bolero', indie: 'indie', rnb: 'R&B', ambient: 'ambient', nature: 'âm thanh thiên nhiên', cafe: 'cà phê', workout: 'sôi động',
  sleep: 'ngủ', sad: 'buồn', happy: 'vui tươi', focus: 'tập trung', folk: 'folk',
};

const LEXICON: [string, RegExp][] = [
  ['lofi', /\blo ?fi\b|\blofi\b|\bchillhop\b/],
  ['chill', /\bchill\b|\brelax(ing)?\b|\bcalm\b|\bthu gian\b/],
  ['hiphop', /\bhip ?hop\b|\brap\b|\btrap\b|\bboom bap\b|\bunderground\b/],
  ['edm', /\bedm\b|\belectronic\b|\bhouse\b|\btechno\b|\btrance\b|\bdubstep\b|\bvinahouse\b|\bdrum and bass\b/],
  ['synthwave', /\bsynthwave\b|\bretrowave\b|\bsynth ?pop\b|\bretro\b/],
  ['rock', /\brock\b|\balternative\b|\bpunk\b|\bgrunge\b/],
  ['metal', /\bmetal\b|\bthrash\b|\bheavy\b/],
  ['jazz', /\bjazz\b|\bswing\b|\bbossa ?nova\b|\bblues\b/],
  ['classical', /\bclassical\b|\borchestra\b|\bsymphony\b|\bco dien\b/],
  ['piano', /\bpiano\b/],
  ['acoustic', /\bacoustic\b|\bguitar\b|\bunplugged\b/],
  ['folk', /\bfolk\b|\bcountry\b/],
  ['ballad', /\bballad\b|\btinh ca\b/],
  ['vpop', /\bv ?pop\b|\bnhac tre\b|\bvietnamese pop\b/],
  ['kpop', /\bk ?pop\b/],
  ['pop', /\bpop\b/],
  ['bolero', /\bbolero\b|\btru tinh\b|\bnhac vang\b/],
  ['indie', /\bindie\b/],
  ['rnb', /\br ?n ?b\b|\brnb\b|\bsoul\b/],
  ['ambient', /\bambient\b|\bdrone\b|\bmeditation\b|\bthien\b/],
  ['nature', /\brain\b|\bocean\b|\bnature\b|\bforest\b|\btieng mua\b/],
  ['cafe', /\bcafe\b|\bcoffee\b|\bca phe\b/],
  ['workout', /\bworkout\b|\bgym\b|\brunning\b|\benergy\b|\bupbeat\b/],
  ['sleep', /\bsleep\b|\bngu ngon\b/],
  ['sad', /\bsad\b|\bbuon\b|\btam trang\b/],
  ['happy', /\bhappy\b|\bvui\b/],
  ['focus', /\bfocus\b|\bstudy\b|\bdeep work\b|\bhoc bai\b/],
];

/** Genres from tags + title words. Title words alone are a weak hint, so tags are preferred when present. */
export function genresOf(t: Pick<Track, 'title' | 'tags' | 'genres'>): string[] {
  if (t.genres?.length) return t.genres;
  const text = normalize(`${(t.tags ?? []).join(' ')} ${t.title}`);
  const out = new Set<string>();
  for (const [g, re] of LEXICON) if (re.test(text)) out.add(g);
  return [...out];
}

const VI_CHARS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

/** 'vi' when Vietnamese letters are present, else the uploader's declared language, else '' (unknown). */
export function languageOf(t: Pick<Track, 'title' | 'channel' | 'lang'>): string {
  if (t.lang) return t.lang;
  if (VI_CHARS.test(`${t.title} ${t.channel}`)) return 'vi';
  return '';
}

/** Mood → genres used by Mood Radio. */
export const MOOD_GENRES: Record<string, string[]> = {
  lofi: ['lofi', 'chill', 'hiphop'],
  relaxing: ['chill', 'ambient', 'acoustic', 'piano'],
  focus: ['focus', 'lofi', 'piano', 'ambient'],
  'deep-work': ['focus', 'ambient', 'synthwave', 'piano'],
  rain: ['nature', 'ambient', 'sleep'],
  sleep: ['sleep', 'ambient', 'piano', 'nature'],
  workout: ['workout', 'edm', 'hiphop', 'rock'],
  happy: ['happy', 'pop', 'vpop', 'kpop'],
  sad: ['sad', 'ballad', 'acoustic', 'piano'],
  acoustic: ['acoustic', 'folk', 'indie'],
  english: ['pop', 'rnb', 'indie', 'rock', 'acoustic'],
};

/** Categories that are about a language rather than a style. */
export const MOOD_LANG: Record<string, string> = { english: 'en' };
