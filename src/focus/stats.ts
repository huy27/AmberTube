// Daily focus statistics (pure). Sessions are keyed by id so the same session is never counted twice.

export interface SessionRecord {
  id: string;
  minutes: number;
  endedAt: number;
}

export interface StatsData {
  days: Record<string, SessionRecord[]>;
}

export const EMPTY_STATS: StatsData = { days: {} };

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function recordSession(data: StatsData, rec: SessionRecord, keepDays = 60): StatsData {
  const key = dayKey(rec.endedAt);
  const list = data.days[key] ?? [];
  if (list.some((s) => s.id === rec.id)) return data;
  const days = { ...data.days, [key]: [...list, rec] };
  const keys = Object.keys(days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - keepDays))) delete days[k];
  return { days };
}

export function todayStats(data: StatsData, now: number): { sessions: number; minutes: number } {
  const list = data.days[dayKey(now)] ?? [];
  return { sessions: list.length, minutes: Math.round(list.reduce((s, r) => s + r.minutes, 0)) };
}

export function lastDays(data: StatsData, now: number, n = 7): { key: string; minutes: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const key = dayKey(now - (n - 1 - i) * 86_400_000);
    return { key, minutes: Math.round((data.days[key] ?? []).reduce((s, r) => s + r.minutes, 0)) };
  });
}

export function isValidStats(x: unknown): x is StatsData {
  return !!x && typeof x === 'object' && typeof (x as StatsData).days === 'object';
}
