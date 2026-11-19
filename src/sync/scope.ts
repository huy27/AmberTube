// Whose data the app is showing: the guest's (default) or a signed-in account's.
// Each scope has its own localStorage keys ("ambertube:v1" for the guest, "ambertube:v1@u:<id>" for an
// account), so two accounts on one device — or the guest — never see each other's library.
import { useSyncExternalStore } from 'react';

export const GUEST = 'guest';
const ACTIVE_KEY = 'ambertube:active-scope';
const listeners = new Set<() => void>();

function initial(): string {
  try {
    const s = localStorage.getItem(ACTIVE_KEY);
    return s && /^u:[\w-]{8,64}$/.test(s) ? s : GUEST;
  } catch {
    return GUEST;
  }
}
let current = initial();

export const userScope = (userId: string) => `u:${userId}`;
export const getScope = () => current;
export const scopeUserId = (s = current) => (s.startsWith('u:') ? s.slice(2) : null);

/** Switch whose data is shown. Providers reload their state; the player keeps playing. */
export function setScope(scope: string) {
  if (scope === current) return;
  current = scope;
  try {
    if (scope === GUEST) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, scope);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

export function subscribeScope(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const useScope = () => useSyncExternalStore(subscribeScope, getScope, getScope);

/** The storage key of `base` for a scope (the guest keeps the original keys). */
export const scopedKey = (base: string, scope = current) => (scope === GUEST ? base : `${base}@${scope}`);

/** Remove everything stored for an account on this device (sign-out on a shared screen). */
export function clearScopeData(scope: string) {
  if (scope === GUEST) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.endsWith(`@${scope}`)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
