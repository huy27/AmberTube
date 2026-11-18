// Minimal typings for the YouTube IFrame Player API (only what AmberTube uses).
declare namespace YT {
  interface VideoData { video_id: string; title: string; author: string }
  interface PlayerEvent { target: Player }
  interface OnStateChangeEvent extends PlayerEvent { data: number }
  interface OnErrorEvent extends PlayerEvent { data: number }
  interface PlayerOptions {
    width?: string | number;
    height?: string | number;
    videoId?: string;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (e: PlayerEvent) => void;
      onStateChange?: (e: OnStateChangeEvent) => void;
      onError?: (e: OnErrorEvent) => void;
    };
  }
  class Player {
    constructor(el: HTMLElement | string, opts: PlayerOptions);
    loadVideoById(opts: { videoId: string; startSeconds?: number }): void;
    cueVideoById(opts: { videoId: string; startSeconds?: number }): void;
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    setVolume(volume: number): void;
    mute(): void;
    unMute(): void;
    setPlaybackRate(rate: number): void;
    getPlaybackRate(): number;
    getAvailablePlaybackRates(): number[];
    getVideoData(): VideoData;
    destroy(): void;
  }
}

interface Window {
  YT?: typeof YT;
  onYouTubeIframeAPIReady?: () => void;
}
