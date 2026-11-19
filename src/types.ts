export type ProviderId = 'youtube' | 'demo' | 'local';
export type License = 'owned' | 'cc-by' | 'standard';
export type SceneVariant = 'city' | 'window' | 'sea' | 'desk' | 'rain';
export type RepeatMode = 'off' | 'all' | 'one';
export type VisualizerMode = 'wave' | 'spectrum';
export type VoiceLang = 'vi-VN' | 'en-US';

export interface SceneArtSpec {
  variant: SceneVariant;
  hue: number;
}

export interface Track {
  id: string;
  provider: ProviderId;
  title: string;
  channel: string;
  channelId: string | null;
  /** NaN / null when unknown */
  views: number | null;
  /** seconds; 0 when unknown or live */
  duration: number;
  isLive: boolean;
  license: License;
  videoId?: string;
  thumbnail?: string;
  art?: SceneArtSpec;
  tags?: string[];
  /** object URL for local files (never persisted) */
  src?: string;
  /** known to be unplayable before trying (demo catalogue) */
  unavailable?: boolean;
  /** approximate style from uploader tags / catalogue (kept when the track is stored) */
  genres?: string[];
  /** language: 'vi', an ISO code from YouTube, or undefined when unknown */
  lang?: string;
  /** YouTube category id ('10' = Music) */
  categoryId?: string;
  /** when it was added to favorites / a playlist (ms); used to order synced lists */
  addedAt?: number;
}

export interface HistoryEntry {
  entryId: string;
  track: Track;
  playedAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
}

export type DownloadStatus = 'converting' | 'done' | 'error';

export interface DownloadJob {
  id: string;
  track: Track;
  status: DownloadStatus;
  progress: number;
  bitrate: number;
  seen: boolean;
  startedAt: number;
  finishedAt?: number;
  url?: string | null;
  fileName?: string;
  error?: string;
}

export interface Settings {
  bitrate: number;
  autoplay: boolean;
  authorizedChannels: string[];
  visualizer: VisualizerMode;
  voiceLang: VoiceLang;
}

export interface LyricLine {
  /** seconds, or null for unsynced lyrics */
  time: number | null;
  text: string;
}

export interface Lyrics {
  synced: boolean;
  instrumental?: boolean;
  lines: LyricLine[];
  source: string;
}

/** An artist from a chart (Last.fm). Fields the source doesn't provide are null — never guessed. */
export interface Artist {
  name: string;
  mbid: string | null;
  url: string | null;
  image: string | null;
  listeners: number | null;
  playcount: number | null;
  rank: number;
}

export type ChartSource = 'vietnam' | 'global';

/**
 * A track from a Last.fm chart: metadata only (Last.fm has no playable audio). It becomes a playable
 * `Track` once matched to a YouTube upload (see charts/resolve.ts). Missing fields are null.
 */
export interface ChartTrack {
  key: string; // normalized "artist|title" — identity used for de-duplication
  title: string;
  artist: string;
  image: string | null;
  url: string | null;
  listeners: number | null;
  playcount: number | null;
  rank: number;
  source: ChartSource;
}
