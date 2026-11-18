// Ambient sound mixer. Every sound is synthesized with the Web Audio API (filtered noise + small
// procedural events), so there are no third-party recordings to license and nothing to download.
import type { AmbientId, AmbientPrefs } from './settings.ts';
import { ensureRunning, getAudioContext } from './audio.ts';

interface Voice {
  out: GainNode;
  stop(): void;
}

type Noise = 'white' | 'pink' | 'brown';
const buffers = new WeakMap<AudioContext, Record<Noise, AudioBuffer>>();

function noiseBuffers(c: AudioContext): Record<Noise, AudioBuffer> {
  const cached = buffers.get(c);
  if (cached) return cached;
  const len = c.sampleRate * 6;
  const make = (fill: (d: Float32Array) => void) => {
    const b = c.createBuffer(1, len, c.sampleRate);
    fill(b.getChannelData(0));
    return b;
  };
  const white = make((d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
  const pink = make((d) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  });
  const brown = make((d) => {
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
  });
  const set = { white, pink, brown };
  buffers.set(c, set);
  return set;
}

function noise(c: AudioContext, type: Noise): AudioBufferSourceNode {
  const s = c.createBufferSource();
  s.buffer = noiseBuffers(c)[type];
  s.loop = true;
  s.loopStart = Math.random() * 2;
  s.start(0, Math.random() * 5);
  return s;
}

function filter(c: AudioContext, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function gain(c: AudioContext, v: number): GainNode {
  const g = c.createGain();
  g.gain.value = v;
  return g;
}

/** Slow sine LFO added onto an AudioParam (param keeps its base value). */
function lfo(c: AudioContext, param: AudioParam, rate: number, depth: number): OscillatorNode {
  const o = c.createOscillator();
  o.frequency.value = rate;
  const d = gain(c, depth);
  o.connect(d).connect(param);
  o.start();
  return o;
}

/** Calls `fn` at random intervals between min and max ms. Returns a canceller. */
function every(min: number, max: number, fn: () => void): () => void {
  let id: ReturnType<typeof setTimeout>;
  let alive = true;
  const loop = () => {
    id = setTimeout(() => {
      if (!alive) return;
      fn();
      loop();
    }, min + Math.random() * (max - min));
  };
  loop();
  return () => {
    alive = false;
    clearTimeout(id);
  };
}

function burst(c: AudioContext, dest: AudioNode, opts: { dur: number; freq: number; q: number; level: number; type?: BiquadFilterType }) {
  if (document.hidden && c.state !== 'running') return;
  const t = c.currentTime;
  const s = c.createBufferSource();
  s.buffer = noiseBuffers(c).white;
  const f = filter(c, opts.type ?? 'bandpass', opts.freq, opts.q);
  const g = gain(c, 0);
  g.gain.setValueAtTime(opts.level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 5, opts.dur + 0.02);
}

function tone(c: AudioContext, dest: AudioNode, f0: number, f1: number, dur: number, level: number, at = 0) {
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = gain(c, 0);
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + dur * 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

type Builder = (c: AudioContext, out: GainNode) => () => void;

const BUILDERS: Record<AmbientId, Builder> = {
  rain: (c, out) => {
    const bed = noise(c, 'pink');
    bed.connect(filter(c, 'highpass', 450)).connect(filter(c, 'lowpass', 7000)).connect(gain(c, 0.9)).connect(out);
    const cancel = every(25, 90, () => burst(c, out, { dur: 0.02 + Math.random() * 0.03, freq: 2500 + Math.random() * 4000, q: 2, level: 0.05 + Math.random() * 0.12 }));
    return () => { cancel(); bed.stop(); };
  },
  ocean: (c, out) => {
    const body = noise(c, 'brown');
    const swell = gain(c, 0.55);
    body.connect(filter(c, 'lowpass', 650)).connect(swell).connect(out);
    const foam = noise(c, 'pink');
    const foamGain = gain(c, 0.12);
    foam.connect(filter(c, 'bandpass', 1400, 0.6)).connect(foamGain).connect(out);
    const l1 = lfo(c, swell.gain, 0.085, 0.45);
    const l2 = lfo(c, foamGain.gain, 0.085, 0.11);
    return () => { body.stop(); foam.stop(); l1.stop(); l2.stop(); };
  },
  forest: (c, out) => {
    const breeze = noise(c, 'pink');
    const g = gain(c, 0.22);
    breeze.connect(filter(c, 'bandpass', 520, 0.45)).connect(g).connect(out);
    const l = lfo(c, g.gain, 0.06, 0.12);
    const cancel = every(1400, 4800, () => {
      const base = 2200 + Math.random() * 1800;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) tone(c, out, base, base * (1.25 + Math.random() * 0.3), 0.09 + Math.random() * 0.06, 0.05, i * 0.13);
    });
    return () => { cancel(); breeze.stop(); l.stop(); };
  },
  fire: (c, out) => {
    const rumble = noise(c, 'brown');
    rumble.connect(filter(c, 'lowpass', 420)).connect(gain(c, 0.7)).connect(out);
    const cancel = every(30, 160, () => {
      if (Math.random() < 0.55) burst(c, out, { dur: 0.006 + Math.random() * 0.02, freq: 1500 + Math.random() * 3000, q: 0.8, level: 0.08 + Math.random() * 0.35, type: 'highpass' });
    });
    return () => { cancel(); rumble.stop(); };
  },
  wind: (c, out) => {
    const n = noise(c, 'pink');
    const bp = filter(c, 'bandpass', 520, 0.9);
    const g = gain(c, 0.6);
    n.connect(bp).connect(g).connect(out);
    const l1 = lfo(c, bp.frequency, 0.07, 260);
    const l2 = lfo(c, g.gain, 0.11, 0.35);
    return () => { n.stop(); l1.stop(); l2.stop(); };
  },
  cafe: (c, out) => {
    const murmur = noise(c, 'pink');
    const g = gain(c, 0.45);
    murmur.connect(filter(c, 'bandpass', 620, 0.8)).connect(filter(c, 'lowpass', 2200)).connect(g).connect(out);
    const l1 = lfo(c, g.gain, 2.9, 0.08);
    const l2 = lfo(c, g.gain, 4.7, 0.06);
    const room = noise(c, 'brown');
    room.connect(filter(c, 'lowpass', 300)).connect(gain(c, 0.25)).connect(out);
    const cancel = every(2500, 7000, () => {
      const f = 2700 + Math.random() * 1200;
      tone(c, out, f, f * 0.995, 0.45, 0.03);
      tone(c, out, f * 2.7, f * 2.68, 0.25, 0.012);
    });
    return () => { cancel(); murmur.stop(); room.stop(); l1.stop(); l2.stop(); };
  },
  white: (c, out) => {
    const n = noise(c, 'white');
    n.connect(gain(c, 0.25)).connect(out);
    return () => n.stop();
  },
};

/** Per-sound loudness trims so 50% sounds similarly loud for each channel. */
const TRIM: Record<AmbientId, number> = { rain: 0.9, ocean: 1, forest: 1.1, fire: 0.9, wind: 0.8, cafe: 1, white: 0.45 };

export class AmbientMixer {
  private master: GainNode | null = null;
  private voices = new Map<AmbientId, Voice>();
  private disposed = false;

  private context(): AudioContext | null {
    const c = getAudioContext();
    if (!c) return null;
    if (!this.master) {
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.master.connect(c.destination);
    }
    return c;
  }

  /** Bring the running sounds in line with the preferences (fades in/out, starts/stops voices). */
  apply(prefs: AmbientPrefs): void {
    if (this.disposed) return;
    const anyOn = !prefs.muted && prefs.master > 0 && Object.values(prefs.channels).some((ch) => ch.on && ch.volume > 0);
    if (!anyOn && !this.voices.size) return;
    const c = this.context();
    if (!c || !this.master) return;
    ensureRunning(c);
    const t = c.currentTime;
    this.master.gain.setTargetAtTime(prefs.muted ? 0 : Math.pow(prefs.master / 100, 2), t, 0.12);

    for (const [id, ch] of Object.entries(prefs.channels) as [AmbientId, AmbientPrefs['channels'][AmbientId]][]) {
      const want = ch.on && ch.volume > 0 && !prefs.muted;
      const v = this.voices.get(id);
      if (want) {
        const level = Math.pow(ch.volume / 100, 2) * TRIM[id];
        if (v) v.out.gain.setTargetAtTime(level, t, 0.15);
        else {
          const out = c.createGain();
          out.gain.value = 0;
          out.connect(this.master);
          const stopFn = BUILDERS[id](c, out);
          out.gain.setTargetAtTime(level, t, 0.4);
          this.voices.set(id, { out, stop: stopFn });
        }
      } else if (v) {
        this.voices.delete(id);
        v.out.gain.setTargetAtTime(0, t, 0.15);
        setTimeout(() => {
          v.stop();
          v.out.disconnect();
        }, 700);
      }
    }
  }

  get activeCount(): number {
    return this.voices.size;
  }

  /** Stop every voice and release the graph. */
  dispose(): void {
    this.disposed = true;
    const c = getAudioContext();
    const t = c?.currentTime ?? 0;
    this.master?.gain.setTargetAtTime(0, t, 0.1);
    const voices = [...this.voices.values()];
    this.voices.clear();
    const master = this.master;
    this.master = null;
    setTimeout(() => {
      voices.forEach((v) => {
        v.stop();
        v.out.disconnect();
      });
      master?.disconnect();
    }, 500);
  }
}
