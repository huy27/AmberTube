import type { Track } from '../../types';
import { ALL_RATES, type EngineEvents, type LoadOptions, type PlaybackEngine } from './types';

/** Simulated clock for the offline demo catalogue (there is no real media). */
export class DemoEngine implements PlaybackEngine {
  readonly id = 'demo' as const;
  private base = 0;
  private startedAt = 0;
  private playing = false;
  private rate = 1;
  private duration = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private loadToken = 0;

  constructor(private events: EngineEvents) {}

  load(track: Track, opts: LoadOptions): void {
    this.stop();
    const token = ++this.loadToken;
    this.base = opts.startAt;
    this.rate = opts.rate;
    this.duration = track.duration;
    this.events.onBuffering(true);
    // simulate a short network round-trip so loading/error states are visible
    setTimeout(() => {
      if (token !== this.loadToken) return;
      this.events.onBuffering(false);
      if (track.unavailable) return this.events.onError('Video này không khả dụng.');
      this.events.onDuration(track.duration);
      this.events.onRates(ALL_RATES);
      if (opts.autoplay) this.play();
      else this.events.onPause();
    }, 180);
  }

  play(): void {
    if (this.playing || !this.duration) return;
    if (this.base >= this.duration) this.base = 0;
    this.playing = true;
    this.startedAt = performance.now();
    this.timer = setInterval(() => {
      if (this.getCurrentTime() >= this.duration) {
        this.base = this.duration;
        this.halt();
        this.events.onEnded();
      }
    }, 200);
    this.events.onPlay();
  }

  pause(): void {
    if (!this.playing) return;
    this.base = this.getCurrentTime();
    this.halt();
    this.events.onPause();
  }

  private halt() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  stop(): void {
    this.loadToken++;
    this.halt();
    this.base = 0;
    this.duration = 0;
  }

  seek(seconds: number): void {
    this.base = Math.max(0, Math.min(seconds, this.duration || seconds));
    this.startedAt = performance.now();
  }

  getCurrentTime(): number {
    if (!this.playing) return this.base;
    return Math.min(this.duration, this.base + ((performance.now() - this.startedAt) / 1000) * this.rate);
  }

  setVolume(): void {}

  setRate(rate: number): void {
    this.base = this.getCurrentTime();
    this.startedAt = performance.now();
    this.rate = rate;
  }

  getAnalyser(): AnalyserNode | null {
    return null;
  }
}
