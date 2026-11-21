/**
 * YouTube Data API quota used, counted in a shared Supabase counter (all devices and users share one API key).
 * Calls are buffered in memory and sent in batches through two RPC functions (supabase/migrations/0003_api_usage.sql);
 * nothing is stored in the browser. Quota resets at midnight Pacific Time. The real numbers are in Google Cloud Console.
 */
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabase } from './supabase';

export const DAILY_QUOTA = 10_000;
export const QUOTA_COST = { search: 100, videos: 1, channels: 1 } as const;
export type QuotaKind = keyof typeof QUOTA_COST;

export interface QuotaDay { day: string; search: number; videos: number; channels: number; units: number }

const FLUSH_MS = 20_000;
const MAX_PENDING = 2_000; // if Supabase is unreachable (or 0003 was not run) keep memory bounded

let pending: Record<QuotaKind, number> = { search: 0, videos: 0, channels: 0 };
let timer: ReturnType<typeof setTimeout> | null = null;
let sending = false;

const total = () => pending.search + pending.videos + pending.channels;

function rpc(fn: string, body: unknown, keepalive = false): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive,
  });
}

/** Send what has been counted so far. Never throws; on failure the counts stay buffered for the next try. */
export async function flushQuota(keepalive = false): Promise<void> {
  if (!hasSupabase || sending || total() === 0) return;
  sending = true;
  const batch = pending;
  pending = { search: 0, videos: 0, channels: 0 };
  try {
    const r = await rpc('ambertube_record_api_usage', { p_search: batch.search, p_videos: batch.videos, p_channels: batch.channels }, keepalive);
    if (!r.ok) throw new Error(String(r.status));
  } catch {
    pending = { search: pending.search + batch.search, videos: pending.videos + batch.videos, channels: pending.channels + batch.channels };
    if (total() > MAX_PENDING) pending = { search: 0, videos: 0, channels: 0 };
  } finally {
    sending = false;
  }
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushQuota().then(() => total() > 0 && schedule());
  }, FLUSH_MS);
}

export function recordQuota(kind: QuotaKind) {
  if (!hasSupabase) return;
  pending[kind]++;
  schedule();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flushQuota(true));
}

/** The last days of shared usage, newest first. Throws if Supabase is not set up or migration 0003 was not run. */
export async function fetchQuotaHistory(days = 7): Promise<QuotaDay[]> {
  if (!hasSupabase) throw new Error('Supabase chưa được cấu hình.');
  await flushQuota();
  const r = await rpc('ambertube_api_usage', { p_days: days });
  if (!r.ok) throw new Error(`Không đọc được số liệu (${r.status}). Đã chạy 0003_api_usage.sql chưa?`);
  return (await r.json()) as QuotaDay[];
}

/** YYYY-MM-DD in America/Los_Angeles (the day the quota counts against). */
export function quotaDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
