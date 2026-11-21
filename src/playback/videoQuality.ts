/** Preferred YouTube video quality (a hint only: YouTube may ignore it). Per device. */
export const QUALITIES = [
  { id: 'auto', label: 'Tự động' },
  { id: 'small', label: '240p' },
  { id: 'medium', label: '360p' },
  { id: 'large', label: '480p' },
  { id: 'hd720', label: '720p' },
  { id: 'hd1080', label: '1080p' },
] as const;
export type QualityId = (typeof QUALITIES)[number]['id'];

const KEY = 'ambertube:video-quality';
const listeners = new Set<() => void>();
let current: QualityId = (() => {
  try {
    const v = localStorage.getItem(KEY);
    return QUALITIES.some((q) => q.id === v) ? (v as QualityId) : 'auto';
  } catch {
    return 'auto';
  }
})();

export const getQuality = () => current;
export function setQuality(q: QualityId) {
  current = q;
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
export function subscribeQuality(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
