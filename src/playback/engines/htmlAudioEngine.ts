import type { Track } from '../../types';
import { ALL_RATES, type EngineEvents, type LoadOptions, type PlaybackEngine } from './types';

/**
 * iPhone / iPad: when an <audio> element is routed through Web Audio (createMediaElementSource), its
 * sound goes through the AudioContext, and iOS interrupts that context when Safari is hidden or the
 * screen locks — the file keeps "playing" but is silent (WebKit bugs 276016, 281566). So on iOS the
 * element plays directly (background playback + Lock Screen work) and the visualizer is decorative.
 */
const IS_IOS = typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/**
 * Plays local audio files with an <audio> element. Because the file is the user's own, its audio
 * can be routed through Web Audio for real spectrum/waveform analysis (not on iOS, see above).
 */
export class HtmlAudioEngine implements PlaybackEngine {
  readonly id = 'local' as const;
  private audio = new Audio();
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private pendingStart = 0;

  constructor(private events: EngineEvents) {
    const a = this.audio;
    a.preload = 'auto';
    a.addEventListener('play', () => events.onPlay());
    a.addEventListener('pause', () => !a.ended && events.onPause());
    a.addEventListener('ended', () => events.onEnded());
    a.addEventListener('waiting', () => events.onBuffering(true));
    a.addEventListener('playing', () => events.onBuffering(false));
    a.addEventListener('loadedmetadata', () => {
      if (this.pendingStart) a.currentTime = this.pendingStart;
      this.pendingStart = 0;
      events.onDuration(a.duration);
      events.onRates(ALL_RATES);
    });
    a.addEventListener('error', () => {
      if (!a.getAttribute('src')) return;
      events.onBuffering(false);
      events.onError('File này không còn khả dụng. Hãy thêm lại trong Thư viện › File trên máy.');
    });
  }

  private ensureGraph() {
    if (this.ctx || IS_IOS) return;
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      const source = this.ctx.createMediaElementSource(this.audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
      this.analyser = null;
    }
  }

  load(track: Track, opts: LoadOptions): void {
    if (!track.src) {
      this.events.onError('File này không còn khả dụng. Hãy thêm lại trong Thư viện › File trên máy.');
      return;
    }
    this.events.onBuffering(true);
    this.pendingStart = opts.startAt;
    this.audio.src = track.src;
    this.audio.playbackRate = opts.rate;
    this.setVolume(opts.volume, opts.muted);
    if (opts.autoplay) this.play();
    else this.events.onBuffering(false);
  }

  play(): void {
    this.ensureGraph();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    this.audio.play().catch((err: DOMException) => {
      if (err.name === 'NotAllowedError') {
        this.events.onBuffering(false);
        if (this.events.onBlocked) this.events.onBlocked();
        else this.events.onPause();
      }
      else if (err.name !== 'AbortError') this.events.onError('Không phát được file này.');
    });
  }

  pause(): void {
    this.audio.pause();
  }

  stop(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }

  seek(seconds: number): void {
    if (Number.isFinite(seconds)) this.audio.currentTime = seconds;
  }

  getCurrentTime(): number {
    return this.audio.currentTime || 0;
  }

  setVolume(volume: number, muted: boolean): void {
    this.audio.volume = Math.max(0, Math.min(1, volume / 100));
    this.audio.muted = muted;
  }

  setRate(rate: number): void {
    this.audio.playbackRate = rate;
  }

  isActuallyPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }
}
