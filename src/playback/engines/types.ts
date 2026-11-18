import type { ProviderId, Track } from '../../types';

export interface EngineEvents {
  onPlay(): void;
  onPause(): void;
  onEnded(): void;
  /** the track can't be played (removed, private, embedding disabled, unreadable file…) */
  onError(message: string): void;
  onBuffering(buffering: boolean): void;
  onDuration(seconds: number): void;
  /** playback rates the provider supports for the loaded media */
  onRates(rates: number[]): void;
  onMeta?(meta: { videoId?: string; title?: string; channel?: string }): void;
  /** the browser's autoplay policy prevented playback; needs a user gesture */
  onBlocked?(): void;
  /** loading is taking unusually long (slow network) — still trying */
  onSlow?(): void;
}

export interface LoadOptions {
  autoplay: boolean;
  startAt: number;
  rate: number;
  volume: number;
  muted: boolean;
}

/** A playback backend. The PlayerContext talks to engines only through this interface. */
export interface PlaybackEngine {
  readonly id: ProviderId;
  load(track: Track, opts: LoadOptions): void;
  play(): void;
  pause(): void;
  /** stop and release the current media */
  stop(): void;
  seek(seconds: number): void;
  getCurrentTime(): number;
  setVolume(volume: number, muted: boolean): void;
  setRate(rate: number): void;
  /** Real audio analysis, only for providers that expose an accessible audio stream. */
  getAnalyser(): AnalyserNode | null;
  /** What the media is actually doing right now (used to resync the UI when the page becomes visible again). */
  isActuallyPlaying(): boolean;
}

export const ALL_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
