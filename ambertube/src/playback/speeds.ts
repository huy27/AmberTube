export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export type Speed = (typeof SPEEDS)[number];

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** The AmberTube speeds that the current provider can actually play. Always contains 1. */
export function supportedSpeeds(providerRates: readonly number[]): number[] {
  const list = SPEEDS.filter((s) => providerRates.some((r) => near(r, s)));
  return list.length ? list : [1];
}

/** The preferred speed if supported, otherwise the closest supported one. */
export function effectiveSpeed(preferred: number, supported: readonly number[]): number {
  if (supported.some((s) => near(s, preferred))) return preferred;
  return supported.reduce((best, s) => (Math.abs(s - preferred) < Math.abs(best - preferred) ? s : best), supported[0] ?? 1);
}

export const isSpeed = (n: unknown): n is Speed => typeof n === 'number' && SPEEDS.some((s) => near(s, n));

export const formatSpeed = (r: number): string => `${Number.isInteger(r) ? r.toFixed(1) : String(r)}x`;
