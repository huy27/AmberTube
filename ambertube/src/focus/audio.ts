// One shared AudioContext for Focus mode (ambient mixer + notification chime).
let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** Resume the context now, or on the next user gesture if the browser's autoplay policy blocks it. */
export function ensureRunning(c: AudioContext): void {
  if (c.state === 'running') return;
  void c.resume().catch(() => {});
  const unlock = () => {
    void c.resume().catch(() => {});
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

/** Soft synthesized chime (no audio files needed). Rising for "break", falling-resolving for "focus". */
export function playChime(kind: 'focus-done' | 'break-done', volume = 0.35): void {
  const c = getAudioContext();
  if (!c) return;
  ensureRunning(c);
  const notes = kind === 'focus-done' ? [659.25, 783.99, 1046.5] : [783.99, 659.25, 880];
  const t0 = c.currentTime + 0.05;
  const out = c.createGain();
  out.gain.value = volume;
  out.connect(c.destination);
  notes.forEach((f, i) => {
    const t = t0 + i * 0.22;
    for (const [mult, amp] of [[1, 1], [2, 0.25], [3, 0.08]] as const) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = f * mult;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5 * amp, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 1.5);
    }
  });
  setTimeout(() => out.disconnect(), 2600);
}
