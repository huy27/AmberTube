export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

const trim = (v: number) => (v >= 10 ? Math.floor(v) : Math.floor(v * 10) / 10).toString().replace('.', ',');

/** YouTube-style Vietnamese view counts: 14 Tr lượt xem, 1,2 N lượt xem. */
export function formatViews(n: number | null | undefined): string {
  const c = formatCount(n);
  return c ? `${c} lượt xem` : '';
}

/** Compact count for table columns: 448 N, 9,8 Tr, 1,2 T. */
export function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  if (n >= 1e9) return `${trim(n / 1e9)} T`;
  if (n >= 1e6) return `${trim(n / 1e6)} Tr`;
  if (n >= 1e3) return `${trim(n / 1e3)} N`;
  return String(n);
}

/** ISO-8601 duration (PT1H2M3S) → seconds. */
export function parseIsoDuration(iso = ''): number {
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [d, h, min, s] = m.slice(1).map((x) => Number(x || 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

export function decodeEntities(str = ''): string {
  const el = document.createElement('textarea');
  el.innerHTML = str;
  return el.value;
}

/** Accepts a bare 11-char id or any common YouTube URL form. */
export function parseYouTubeId(input = ''): string | null {
  const s = input.trim();
  // Bare ids look like ordinary words, so only accept mixed-case tokens that also contain a digit.
  if (/^[\w-]{11}$/.test(s) && /\d/.test(s) && /[A-Z]/.test(s) && /[a-z]/.test(s)) return s;
  try {
    const url = new URL(s);
    if (url.hostname.endsWith('youtu.be')) return url.pathname.slice(1, 12) || null;
    if (url.hostname.includes('youtube.com')) {
      const v = url.searchParams.get('v');
      if (v) return v;
      const parts = url.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live'].includes(parts[0])) return parts[1] || null;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'Nghe nhạc đêm khuya';
  if (h < 11) return 'Chào buổi sáng';
  if (h < 13) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date(now)) - start(d)) / 86400000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { weekday: diff < 7 ? 'long' : undefined, day: 'numeric', month: 'short', year: diff > 300 ? 'numeric' : undefined });
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
