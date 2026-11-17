import { useEffect, useRef } from 'react';
import type { VisualizerMode } from '../types';

interface Props {
  mode: VisualizerMode;
  variant: 'compact' | 'expanded';
  playing: boolean;
  /** returns a real AnalyserNode only for providers with an accessible audio stream (local files) */
  getAnalyser: () => AnalyserNode | null;
  /** 0..1, used to tint already-played bars in the compact waveform */
  progress?: number;
  seed?: string;
  onToggleMode?: () => void;
}

const GREY = '#6E685F';
const GREY_PLAYED = '#A39D94';
const AMBER = '#F5A524';

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w <= 0 || h <= 0) return;
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

function seededPhases(seed: string, n: number): number[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Array.from({ length: n }, () => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h >>> 0) / 4294967296) * Math.PI * 2;
  });
}

/**
 * Canvas visualizer. Uses real frequency / time-domain data when an analyser is available;
 * otherwise (YouTube, demo) draws a decorative animation — protected audio is never accessed.
 */
export default function Visualizer({ mode, variant, playing, getAnalyser, progress = 0, seed = 'x', onToggleMode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef({ mode, playing, progress, getAnalyser });
  props.current = { mode, playing, progress, getAnalyser };
  const hasReal = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const bars = variant === 'compact' ? 34 : 72;
    const phases = seededPhases(seed, bars);
    const level = new Float32Array(bars).fill(0.12);
    let freq: Uint8Array | null = null;
    let wave: Uint8Array | null = null;
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (now: number) => {
      const { mode: m, playing: on, progress: prog, getAnalyser: ga } = props.current;
      const t = now / 1000;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      ctx.clearRect(0, 0, W, H);
      if (W < 4 || H < 4) {
        // hidden (e.g. collapsed on small screens) — idle cheaply
        raf = requestAnimationFrame(draw);
        return;
      }

      const analyser = on ? ga() : null;
      hasReal.current = Boolean(analyser);
      canvas.dataset.source = analyser ? 'analyser' : 'decorative';

      // ---- compute target levels (0..1) ----
      const target = new Float32Array(bars);
      let wavePoints: number[] | null = null;
      if (analyser) {
        if (m === 'spectrum') {
          if (!freq || freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(freq);
          const usable = Math.floor(freq.length * 0.7);
          for (let i = 0; i < bars; i++) {
            // log-spaced bins so bass doesn't take a single bar
            const a = Math.floor(Math.pow(usable, i / bars));
            const b = Math.max(a + 1, Math.floor(Math.pow(usable, (i + 1) / bars)));
            let sum = 0;
            for (let k = a; k < b; k++) sum += freq[k];
            target[i] = sum / (b - a) / 255;
          }
        } else {
          if (!wave || wave.length !== analyser.fftSize) wave = new Uint8Array(analyser.fftSize);
          analyser.getByteTimeDomainData(wave);
          const step = Math.floor(wave.length / bars);
          for (let i = 0; i < bars; i++) {
            let peak = 0;
            for (let k = 0; k < step; k++) peak = Math.max(peak, Math.abs(wave[i * step + k] - 128) / 128);
            target[i] = Math.min(1, peak * 1.8);
          }
          wavePoints = Array.from({ length: 160 }, (_, i) => (wave![Math.floor((i / 160) * wave!.length)] - 128) / 128);
        }
      } else {
        for (let i = 0; i < bars; i++) {
          const x = i / (bars - 1);
          const env = m === 'spectrum' ? 0.35 + 0.65 * Math.exp(-Math.pow((x - 0.25) / 0.35, 2)) : Math.sin(x * Math.PI) * 0.55 + 0.45;
          const n = 0.5 + 0.25 * Math.sin(t * 2.3 + phases[i]) + 0.15 * Math.sin(t * 5.1 + phases[i] * 1.7) + 0.1 * Math.sin(t * 9.7 + i);
          target[i] = on ? env * n : env * 0.16;
        }
      }

      const k = reduceMotion ? 1 : 1 - Math.pow(0.0005, dt); // frame-rate independent easing
      for (let i = 0; i < bars; i++) level[i] += (target[i] - level[i]) * k;

      // ---- draw ----
      if (m === 'spectrum') {
        const gap = variant === 'compact' ? 2 : 3;
        const bw = (W - gap * (bars - 1)) / bars;
        const grad = ctx.createLinearGradient(0, H, 0, 0);
        grad.addColorStop(0, 'rgba(245, 165, 36,0.55)');
        grad.addColorStop(1, AMBER);
        ctx.fillStyle = variant === 'compact' && !on ? GREY : grad;
        for (let i = 0; i < bars; i++) {
          const h = Math.max(2, level[i] * H * 0.95);
          bar(ctx, i * (bw + gap), H - h, bw, h, Math.min(2, bw / 2));
        }
      } else if (variant === 'compact' || !wavePoints) {
        // mirrored bars, like the reference player's waveform
        const gap = variant === 'compact' ? 2 : 3;
        const bw = (W - gap * (bars - 1)) / bars;
        const played = Math.round(prog * bars);
        for (let i = 0; i < bars; i++) {
          const h = Math.max(3, Math.min(1, level[i]) * H);
          ctx.fillStyle = variant === 'expanded' ? (i < played ? AMBER : 'rgba(245, 165, 36,0.35)') : i < played ? GREY_PLAYED : GREY;
          bar(ctx, i * (bw + gap), (H - h) / 2, bw, h, Math.min(2, bw / 2));
        }
      } else {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = AMBER;
        ctx.shadowColor = 'rgba(245, 165, 36,0.6)';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        wavePoints.forEach((v, i) => {
          const x = (i / (wavePoints!.length - 1)) * W;
          const y = H / 2 + v * H * 0.45;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      if (!reduceMotion || on) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [variant, seed, playing]);

  const label = `Hiệu ứng ${mode === 'spectrum' ? 'phổ tần' : 'dạng sóng'} — bấm để đổi`;
  return (
    <button
      type="button"
      className={`visualizer visualizer--${variant} visualizer--${mode}`}
      onClick={onToggleMode}
      aria-label={label}
      title={`${label}${getAnalyser() ? ' (phân tích âm thanh thật)' : ' (hoạt ảnh trang trí)'}`}
    >
      <canvas ref={canvasRef} />
    </button>
  );
}
