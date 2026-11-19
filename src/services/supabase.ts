// Supabase: accounts + the user's synced data only (music still comes from YouTube / Last.fm / …).
// The client library is loaded on demand, so guests never download it.
import type { SupabaseClient } from '@supabase/supabase-js';

/** Accepts the project URL with or without a trailing "/rest/v1/" (as copied from the dashboard). */
export function normalizeSupabaseUrl(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '');
}

/** A service_role / secret key must never reach a browser: refuse to run with one. */
export function isSecretKey(key: string): boolean {
  if (/^sb_secret_/.test(key)) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

export const SUPABASE_URL = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const secret = KEY ? isSecretKey(KEY) : false;
if (secret) console.error('[AmberTube] VITE_SUPABASE_ANON_KEY is a service_role/secret key. Accounts are disabled — use the anon/publishable key.');

export const SUPABASE_ANON_KEY = secret ? '' : KEY;
export const hasSupabase = /^https?:\/\/[^/]+$/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
export const AUTH_STORAGE_KEY = 'ambertube-auth';

let client: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient> {
  if (!hasSupabase) return Promise.reject(new Error('Supabase chưa được cấu hình.'));
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY },
      realtime: { params: { eventsPerSecond: 5 } },
    }));
  return client;
}

/** A session saved by an earlier visit (so the client is loaded right away to restore it). */
export function hasStoredSession(): boolean {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Coming back from Google, an email confirmation or a password-reset link. */
export const urlHasAuthParams = () => /[?&#](code|access_token|error_description|token_hash)=|type=recovery/.test(location.search + location.hash);

/** Which sign-in methods the project has enabled (Google needs to be switched on in the dashboard). */
export async function authSettings(): Promise<{ google: boolean; email: boolean } | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
    if (!r.ok) return null;
    const j = await r.json();
    return { google: j?.external?.google === true, email: j?.external?.email !== false };
  } catch {
    return null;
  }
}
