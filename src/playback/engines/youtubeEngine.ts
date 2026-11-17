import type { Track } from '../../types';
import type { EngineEvents, LoadOptions, PlaybackEngine } from './types';

const STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

const ERRORS: Record<number, string> = {
  2: 'Link video không hợp lệ.',
  5: 'Không phát được video này trong trình duyệt.',
  100: 'Video không khả dụng (đã bị gỡ hoặc ở chế độ riêng tư).',
  101: 'Chủ sở hữu không cho phép phát video này ở đây.',
  150: 'Chủ sở hữu không cho phép phát video này ở đây.',
};

let apiPromise: Promise<typeof YT> | null = null;
function loadApi(): Promise<typeof YT> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT!);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => {
        apiPromise = null;
        reject(new Error('Không tải được trình phát YouTube. Hãy kiểm tra kết nối mạng.'));
      };
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

/** Official YouTube IFrame Player API. Audio is protected, so getAnalyser() is always null. */
export class YouTubeEngine implements PlaybackEngine {
  readonly id = 'youtube' as const;
  private player: YT.Player | null = null;
  private ready = false;
  private pending: { videoId: string; opts: LoadOptions } | null = null;
  private current: string | null = null;
  private vol = { volume: 70, muted: false };
  private rate = 1;
  private lastState = -1;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  /** safety net: some embeds/browsers occasionally drop the ENDED state event → poll the state while playing */
  private poll: ReturnType<typeof setInterval> | null = null;
  private endedFor: string | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private events: EngineEvents, private getHost: () => HTMLElement | null) {}

  private async ensurePlayer(): Promise<void> {
    if (this.player) return;
    const api = await loadApi();
    if (this.player) return;
    const host = this.getHost();
    if (!host) throw new Error('Player host is missing');
    const mount = document.createElement('div');
    host.replaceChildren(mount);
    this.player = new api.Player(mount, {
      width: '100%',
      height: '100%',
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, origin: window.location.origin },
      events: {
        onReady: () => {
          this.ready = true;
          this.applyVolume();
          if (this.pending) {
            const { videoId, opts } = this.pending;
            this.pending = null;
            this.start(videoId, opts);
          }
        },
        onStateChange: (e) => this.onState(e),
        onError: (e) => {
          this.events.onBuffering(false);
          this.events.onError(ERRORS[e.data] ?? 'Không phát được video này.');
        },
      },
    });
  }

  private startPoll() {
    if (this.poll) return;
    this.poll = setInterval(() => {
      const p = this.player;
      if (!this.ready || !p || !this.current) return this.stopPoll();
      let state = -1;
      try {
        state = p.getPlayerState();
      } catch {
        return;
      }
      // ENDED reported by the player but the event never reached us
      if (state === STATE.ENDED && this.lastState !== STATE.ENDED) this.fireEnded(p);
      // or the video sits paused/frozen at its very end
      else if (state !== STATE.PLAYING && state !== STATE.BUFFERING && this.lastState === STATE.PLAYING) {
        const d = p.getDuration() || 0;
        if (d > 0 && p.getCurrentTime() >= d - 0.75) this.fireEnded(p);
      }
    }, 1000);
  }

  private clearSlow() {
    if (this.slowTimer) clearTimeout(this.slowTimer);
    this.slowTimer = null;
  }

  private stopPoll() {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  private fireEnded(_p?: YT.Player) {
    if (this.current && this.endedFor === this.current) return; // once per load
    this.endedFor = this.current;
    this.lastState = STATE.ENDED;
    this.stopPoll();
    this.events.onEnded();
  }

  private onState(e: YT.OnStateChangeEvent) {
    const p = e.target;
    if (e.data === STATE.ENDED) return this.fireEnded(p);
    this.lastState = e.data;
    if (e.data === STATE.PLAYING) {
      this.startPoll();
      this.clearSlow();
    }
    // stuck buffering → tell the UI it's the network, not a dead button
    if (e.data === STATE.BUFFERING && !this.slowTimer) {
      const vid = this.current;
      this.slowTimer = setTimeout(() => {
        this.slowTimer = null;
        if (this.current === vid && this.lastState === STATE.BUFFERING) this.events.onSlow?.();
      }, 4000);
    }
    if (e.data === STATE.PLAYING && this.watchdog) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
    switch (e.data) {
      case STATE.PLAYING: {
        this.events.onBuffering(false);
        this.events.onDuration(p.getDuration() || 0);
        this.events.onRates(p.getAvailablePlaybackRates?.() ?? [1]);
        if (Math.abs(p.getPlaybackRate() - this.rate) > 1e-6) p.setPlaybackRate(this.rate);
        const d = p.getVideoData?.();
        if (d?.title) this.events.onMeta?.({ videoId: d.video_id, title: d.title, channel: d.author });
        this.events.onPlay();
        break;
      }
      case STATE.PAUSED:
        this.events.onPause();
        break;
      case STATE.BUFFERING:
        this.events.onBuffering(true);
        break;
      case STATE.CUED:
        this.events.onBuffering(false);
        this.events.onPause();
        break;
    }
  }

  private start(videoId: string, opts: LoadOptions) {
    const p = this.player!;
    this.current = videoId;
    this.endedFor = null;
    this.clearSlow();
    const req = { videoId, startSeconds: Math.floor(opts.startAt) || undefined };
    if (opts.autoplay) {
      p.loadVideoById(req);
      // if the browser blocks autoplay the player just sits unstarted — report it instead of spinning forever
      if (this.watchdog) clearTimeout(this.watchdog);
      this.lastState = -1;
      // a slow network looks the same as a blocked autoplay at first: if the user has interacted with the
      // page (so autoplay is allowed), keep waiting and say it's loading; only give up after ~20 s
      const stuck = () => this.current === videoId && (this.lastState === -1 || this.lastState === STATE.CUED);
      const userActive = () => (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? false;
      this.watchdog = setTimeout(() => {
        this.watchdog = null;
        if (!stuck()) return;
        if (userActive()) {
          this.events.onSlow?.();
          this.watchdog = setTimeout(() => {
            this.watchdog = null;
            if (!stuck()) return;
            this.events.onBuffering(false);
            this.events.onBlocked?.();
          }, 15000);
        } else {
          this.events.onBuffering(false);
          this.events.onBlocked?.();
        }
      }, 5000);
    } else p.cueVideoById(req);
  }

  private applyVolume() {
    if (!this.ready || !this.player) return;
    this.player.setVolume(this.vol.volume);
    if (this.vol.muted || this.vol.volume === 0) this.player.mute();
    else this.player.unMute();
  }

  load(track: Track, opts: LoadOptions): void {
    if (!track.videoId) return this.events.onError('Link video không hợp lệ.');
    this.vol = { volume: opts.volume, muted: opts.muted };
    this.rate = opts.rate;
    this.events.onBuffering(true);
    if (this.ready) {
      this.applyVolume();
      this.start(track.videoId, opts);
      return;
    }
    this.pending = { videoId: track.videoId, opts };
    this.ensurePlayer().catch((err: Error) => {
      this.pending = null;
      this.events.onBuffering(false);
      this.events.onError(err.message);
    });
  }

  play(): void {
    if (this.ready) this.player!.playVideo();
  }

  pause(): void {
    if (this.ready) this.player!.pauseVideo();
  }

  stop(): void {
    this.pending = null;
    this.current = null;
    this.stopPoll();
    if (this.ready) this.player!.stopVideo();
  }

  seek(seconds: number): void {
    this.endedFor = null; // e.g. repeat-one restarts the same video
    if (this.ready && this.current) this.player!.seekTo(seconds, true);
  }

  getCurrentTime(): number {
    return this.ready && this.current ? this.player!.getCurrentTime() || 0 : 0;
  }

  setVolume(volume: number, muted: boolean): void {
    this.vol = { volume, muted };
    this.applyVolume();
  }

  setRate(rate: number): void {
    this.rate = rate;
    if (this.ready && this.current) this.player!.setPlaybackRate(rate);
  }

  getAnalyser(): AnalyserNode | null {
    return null;
  }
}
