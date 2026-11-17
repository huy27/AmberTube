import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { DownloadJob, HistoryEntry, Playlist, Settings, Track } from '../types';
import { downloadEligibility, runConversion } from '../services/downloads';
import { useToast } from './ToastContext';

const STORAGE_KEY = 'ambertube:v1';
const HISTORY_LIMIT = 200;

interface LibraryState {
  saved: Track[];
  history: HistoryEntry[];
  playlists: Playlist[];
  downloads: DownloadJob[];
  settings: Settings;
}

const DEFAULT_SETTINGS: Settings = { bitrate: 192, autoplay: true, authorizedChannels: [], visualizer: 'wave', voiceLang: 'vi-VN' };

const DEFAULT_STATE: LibraryState = {
  saved: [],
  history: [],
  playlists: [
    { id: 'pl-focus', name: 'Tập trung đêm khuya', tracks: [], createdAt: Date.now() },
    { id: 'pl-chill', name: 'Chủ nhật thư thả', tracks: [], createdAt: Date.now() },
  ],
  downloads: [],
  settings: DEFAULT_SETTINGS,
};

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Strip fields that must not be stored (local object URLs, search tags). */
const slim = (t: Track): Track => {
  const { tags: _tags, src: _src, ...rest } = t;
  return rest;
};

function load(): LibraryState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw) return DEFAULT_STATE;
    // v1 stored history as plain tracks; wrap them as entries
    const history: HistoryEntry[] = (raw.history || []).map((h: HistoryEntry | Track, i: number) =>
      'entryId' in h ? h : { entryId: `legacy-${i}`, track: h, playedAt: Date.now() - i * 60_000 },
    );
    return {
      ...DEFAULT_STATE,
      ...raw,
      history,
      settings: { ...DEFAULT_SETTINGS, ...raw.settings },
      // jobs can't survive a reload, so anything unfinished is marked interrupted
      downloads: (raw.downloads || []).map((d: DownloadJob) =>
        d.status === 'done' || d.status === 'error' ? d : { ...d, status: 'error', error: 'Bị gián đoạn' },
      ),
    };
  } catch {
    return DEFAULT_STATE;
  }
}

type Action =
  | { type: 'TOGGLE_SAVED'; track: Track }
  | { type: 'HISTORY_PUSH'; track: Track; at: number }
  | { type: 'HISTORY_REMOVE'; entryId: string }
  | { type: 'HISTORY_CLEAR' }
  | { type: 'PL_CREATE'; id: string; name: string }
  | { type: 'PL_RENAME'; id: string; name: string }
  | { type: 'PL_DELETE'; id: string }
  | { type: 'PL_ADD'; id: string; track: Track }
  | { type: 'PL_REMOVE'; id: string; trackId: string }
  | { type: 'DL_ADD'; job: DownloadJob }
  | { type: 'DL_UPDATE'; id: string; patch: Partial<DownloadJob> }
  | { type: 'DL_REMOVE'; id: string }
  | { type: 'DL_CLEAR_DONE' }
  | { type: 'DL_SEEN' }
  | { type: 'SETTINGS'; patch: Partial<Settings> };

function reducer(state: LibraryState, a: Action): LibraryState {
  switch (a.type) {
    case 'TOGGLE_SAVED': {
      const exists = state.saved.some((t) => t.id === a.track.id);
      return { ...state, saved: exists ? state.saved.filter((t) => t.id !== a.track.id) : [slim(a.track), ...state.saved] };
    }
    case 'HISTORY_PUSH': {
      const [last, ...rest] = state.history;
      // replaying the same track within 30 minutes refreshes the entry instead of duplicating it
      if (last && last.track.id === a.track.id && a.at - last.playedAt < 30 * 60_000) {
        return { ...state, history: [{ ...last, playedAt: a.at }, ...rest] };
      }
      return { ...state, history: [{ entryId: newId(), track: slim(a.track), playedAt: a.at }, ...state.history].slice(0, HISTORY_LIMIT) };
    }
    case 'HISTORY_REMOVE':
      return { ...state, history: state.history.filter((h) => h.entryId !== a.entryId) };
    case 'HISTORY_CLEAR':
      return { ...state, history: [] };
    case 'PL_CREATE':
      return { ...state, playlists: [...state.playlists, { id: a.id, name: a.name, tracks: [], createdAt: Date.now() }] };
    case 'PL_RENAME':
      return { ...state, playlists: state.playlists.map((p) => (p.id === a.id ? { ...p, name: a.name } : p)) };
    case 'PL_DELETE':
      return { ...state, playlists: state.playlists.filter((p) => p.id !== a.id) };
    case 'PL_ADD':
      return {
        ...state,
        playlists: state.playlists.map((p) =>
          p.id === a.id && !p.tracks.some((t) => t.id === a.track.id) ? { ...p, tracks: [...p.tracks, slim(a.track)] } : p,
        ),
      };
    case 'PL_REMOVE':
      return { ...state, playlists: state.playlists.map((p) => (p.id === a.id ? { ...p, tracks: p.tracks.filter((t) => t.id !== a.trackId) } : p)) };
    case 'DL_ADD':
      return { ...state, downloads: [a.job, ...state.downloads.filter((d) => d.id !== a.job.id)] };
    case 'DL_UPDATE':
      return { ...state, downloads: state.downloads.map((d) => (d.id === a.id ? { ...d, ...a.patch } : d)) };
    case 'DL_REMOVE':
      return { ...state, downloads: state.downloads.filter((d) => d.id !== a.id) };
    case 'DL_CLEAR_DONE':
      return { ...state, downloads: state.downloads.filter((d) => d.status === 'converting') };
    case 'DL_SEEN':
      return { ...state, downloads: state.downloads.map((d) => (d.seen ? d : { ...d, seen: true })) };
    case 'SETTINGS':
      return { ...state, settings: { ...state.settings, ...a.patch } };
    default:
      return state;
  }
}

export interface LibraryApi extends LibraryState {
  localTracks: Track[];
  unseenDownloads: number;
  isSaved(id: string): boolean;
  toggleSaved(track: Track): void;
  pushHistory(track: Track): void;
  removeHistoryEntry(entryId: string): void;
  clearHistory(): void;
  createPlaylist(name: string): string;
  renamePlaylist(id: string, name: string): void;
  deletePlaylist(id: string): void;
  addToPlaylist(playlistId: string, track: Track): void;
  removeFromPlaylist(id: string, trackId: string): void;
  startDownload(track: Track): boolean;
  cancelDownload(id: string): void;
  removeDownload(id: string): void;
  clearFinishedDownloads(): void;
  markDownloadsSeen(): void;
  updateSettings(patch: Partial<Settings>): void;
  addLocalFiles(files: FileList | File[]): number;
  removeLocalTrack(id: string): void;
}

const LibraryCtx = createContext<LibraryApi | null>(null);

function readDuration(src: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => resolve(0);
    a.src = src;
  });
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const toast = useToast();
  const jobs = useRef(new Map<string, AbortController>());
  const settingsRef = useRef(state.settings);
  settingsRef.current = state.settings;

  // Debounced save, plus a synchronous flush when the page is hidden/closed so nothing is lost.
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateRef.current));
      } catch {
        /* storage full or disabled */
      }
    };
    const id = setTimeout(save, 200);
    window.addEventListener('pagehide', save);
    return () => {
      clearTimeout(id);
      window.removeEventListener('pagehide', save);
    };
  }, [state]);

  const isSaved = useCallback((id: string) => state.saved.some((t) => t.id === id), [state.saved]);

  const toggleSaved = useCallback(
    (track: Track) => {
      const wasSaved = state.saved.some((t) => t.id === track.id);
      dispatch({ type: 'TOGGLE_SAVED', track });
      toast(wasSaved ? 'Đã bỏ khỏi yêu thích' : 'Đã thêm vào yêu thích', { type: 'success', duration: 2200 });
    },
    [state.saved, toast],
  );

  const createPlaylist = useCallback((name: string) => {
    const id = `pl-${newId()}`;
    dispatch({ type: 'PL_CREATE', id, name: name.trim() || 'Playlist mới' });
    return id;
  }, []);

  const addToPlaylist = useCallback(
    (playlistId: string, track: Track) => {
      const pl = state.playlists.find((p) => p.id === playlistId);
      dispatch({ type: 'PL_ADD', id: playlistId, track });
      if (pl) toast(`Đã thêm vào “${pl.name}”`, { type: 'success', duration: 2200 });
    },
    [state.playlists, toast],
  );

  const startDownload = useCallback(
    (track: Track) => {
      const check = downloadEligibility(track, settingsRef.current.authorizedChannels);
      if (!check.ok) {
        toast(check.reason, { type: 'warning', duration: 5200 });
        return false;
      }
      if (jobs.current.has(track.id)) {
        toast('Bài này đang được chuyển đổi', { duration: 2000 });
        return false;
      }
      const controller = new AbortController();
      jobs.current.set(track.id, controller);
      const { bitrate, authorizedChannels } = settingsRef.current;
      dispatch({ type: 'DL_ADD', job: { id: track.id, track: slim(track), status: 'converting', progress: 0, bitrate, seen: false, startedAt: Date.now() } });
      toast(`Đang chuyển “${track.title}” sang MP3`, { duration: 2400 });

      runConversion(track, {
        bitrate,
        authorizedChannels,
        signal: controller.signal,
        onProgress: (progress) => dispatch({ type: 'DL_UPDATE', id: track.id, patch: { progress } }),
      })
        .then(({ url, fileName }) => {
          dispatch({ type: 'DL_UPDATE', id: track.id, patch: { status: 'done', progress: 100, url, fileName, seen: false, finishedAt: Date.now() } });
          toast(`MP3 đã sẵn sàng: ${fileName}`, { type: 'success' });
        })
        .catch((err: Error) => {
          if (err.name === 'AbortError') dispatch({ type: 'DL_REMOVE', id: track.id });
          else {
            dispatch({ type: 'DL_UPDATE', id: track.id, patch: { status: 'error', error: err.message, seen: false } });
            toast(err.message, { type: 'warning' });
          }
        })
        .finally(() => jobs.current.delete(track.id));
      return true;
    },
    [toast],
  );

  const addLocalFiles = useCallback(
    (files: FileList | File[]) => {
      const audio = Array.from(files).filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i.test(f.name));
      const tracks: Track[] = audio.map((f) => ({
        id: `local:${f.name}:${f.size}:${f.lastModified}`,
        provider: 'local',
        title: f.name.replace(/\.[^.]+$/, ''),
        channel: 'File trên máy',
        channelId: null,
        views: null,
        duration: 0,
        isLive: false,
        license: 'owned',
        src: URL.createObjectURL(f),
        art: { variant: 'sea', hue: (f.size % 360) | 0 },
      }));
      setLocalTracks((cur) => {
        const known = new Set(cur.map((t) => t.id));
        const fresh = tracks.filter((t) => !known.has(t.id));
        tracks.filter((t) => known.has(t.id)).forEach((t) => URL.revokeObjectURL(t.src!));
        return [...cur, ...fresh];
      });
      tracks.forEach((t) =>
        readDuration(t.src!).then((duration) => setLocalTracks((cur) => cur.map((x) => (x.id === t.id ? { ...x, duration } : x)))),
      );
      if (audio.length < Array.from(files).length) toast('Một số file đã bị bỏ qua vì không phải file âm thanh.', { type: 'warning' });
      return audio.length;
    },
    [toast],
  );

  const removeLocalTrack = useCallback((id: string) => {
    setLocalTracks((cur) => {
      const t = cur.find((x) => x.id === id);
      if (t?.src) URL.revokeObjectURL(t.src);
      return cur.filter((x) => x.id !== id);
    });
  }, []);

  const value = useMemo<LibraryApi>(
    () => ({
      ...state,
      localTracks,
      unseenDownloads: state.downloads.filter((d) => !d.seen).length,
      isSaved,
      toggleSaved,
      pushHistory: (track) => dispatch({ type: 'HISTORY_PUSH', track, at: Date.now() }),
      removeHistoryEntry: (entryId) => dispatch({ type: 'HISTORY_REMOVE', entryId }),
      clearHistory: () => dispatch({ type: 'HISTORY_CLEAR' }),
      createPlaylist,
      renamePlaylist: (id, name) => dispatch({ type: 'PL_RENAME', id, name }),
      deletePlaylist: (id) => dispatch({ type: 'PL_DELETE', id }),
      addToPlaylist,
      removeFromPlaylist: (id, trackId) => dispatch({ type: 'PL_REMOVE', id, trackId }),
      startDownload,
      cancelDownload: (id) => jobs.current.get(id)?.abort(),
      removeDownload: (id) => dispatch({ type: 'DL_REMOVE', id }),
      clearFinishedDownloads: () => dispatch({ type: 'DL_CLEAR_DONE' }),
      markDownloadsSeen: () => dispatch({ type: 'DL_SEEN' }),
      updateSettings: (patch) => dispatch({ type: 'SETTINGS', patch }),
      addLocalFiles,
      removeLocalTrack,
    }),
    [state, localTracks, isSaved, toggleSaved, createPlaylist, addToPlaylist, startDownload, addLocalFiles, removeLocalTrack],
  );

  return <LibraryCtx.Provider value={value}>{children}</LibraryCtx.Provider>;
}

export function useLibrary(): LibraryApi {
  const ctx = useContext(LibraryCtx);
  if (!ctx) throw new Error('useLibrary must be used inside LibraryProvider');
  return ctx;
}
