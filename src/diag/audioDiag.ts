// Opt-in audio lifecycle diagnostics (for testing on real devices, e.g. CarPlay browsers).
// Enable with ?diag=1 in the URL (remembered) — disable with ?diag=0. Never records audio or transcripts.
export interface DiagEntry { t: number; event: string; data?: Record<string, unknown> }

const KEY = 'ambertube:diag';
let enabled = false;
try {
  const q = new URLSearchParams(location.search).get('diag');
  if (q === '1') localStorage.setItem(KEY, '1');
  if (q === '0') localStorage.removeItem(KEY);
  enabled = localStorage.getItem(KEY) === '1';
} catch {
  /* storage unavailable */
}

const entries: DiagEntry[] = [];
const listeners = new Set<() => void>();
const t0 = Date.now();

export const diagEnabled = () => enabled;

export function diag(event: string, data?: Record<string, unknown>): void {
  if (!enabled) return;
  entries.push({ t: Date.now() - t0, event, data });
  if (entries.length > 300) entries.shift();
  listeners.forEach((l) => l());
}

export const diagEntries = (): readonly DiagEntry[] => entries;
export function onDiag(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
