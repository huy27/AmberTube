// Runs the sync engine for the signed-in account: in the background, never blocking playback.
// Triggers: sign-in, local changes (debounced), Realtime notifications, coming back online / to the tab,
// and a slow poll when Realtime isn't connected. Failures are retried with back-off; nothing local is lost.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Playlist, Settings, Track } from '../types';
import { useAuth } from '../auth/AuthContext';
import { useLibrary } from '../context/LibraryContext';
import { useSearchHistory } from '../search/SearchHistoryContext';
import { useListeningStore } from '../recommend/ListeningStore';
import { useRecommendations } from '../recommend/RecommendationProvider';
import { useFocus } from '../focus/PomodoroController';
import { useToast } from '../context/ToastContext';
import { EMPTY_FEEDBACK, type Feedback } from '../recommend/engine';
import { LISTEN_KEY, prune, type ListenEvent } from '../recommend/listening';
import { SEARCH_HISTORY_KEY, loadHistory } from '../search/history';
import { sanitizeFocusSettings } from '../focus/settings';
// the engine, data mapping and Supabase adapter load only once someone signs in (guests never pay for them)
import type { LocalPort, SyncEngine, SyncMeta } from './engine';
import type { Change, LocalData, MigrationCounts } from './model';
import { snapshot, stableJson } from './snapshot';
import { SyncError, toSyncError } from './errors';
import { ACCOUNT_LIMITS } from './limits';
import { GUEST, scopedKey, useScope, userScope } from './scope';

const loadSync = () => Promise.all([import('./engine'), import('./model'), import('./supabaseRemote')])
  .then(([engine, model, remote]) => ({ ...engine, ...model, ...remote }));

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'offline' | 'error' | 'expired';

export interface SyncApi {
  status: SyncStatus;
  lastSync: number | null;
  pending: number;
  /** local items not synced because the account reached a limit */
  rejected: number;
  error: string | null;
  syncNow(): Promise<void>;
  /** the account's usage (rows per kind, approximate bytes), or null when unavailable */
  usage(): Promise<Record<string, number> | null>;
  /** try to send pending changes within `ms`; true when nothing is left unsent */
  flush(ms?: number): Promise<boolean>;
  /** data this device has from before signing in, when not yet merged or declined */
  guestOffer: MigrationCounts | null;
  mergeGuest(): Promise<void>;
  declineGuest(): void;
  laterGuest(): void;
  /** the guest data that could be merged now (for the account page), or null */
  guestAvailable: MigrationCounts | null;
  offerGuest(): void;
  /** remove every synced row of this account (all devices) and this device's copy */
  deleteCloudData(): Promise<void>;
}

const Ctx = createContext<SyncApi | null>(null);
const META_KEY = 'ambertube:sync';
const DECISION_KEY = 'ambertube:guest-merge'; // guest scope: { [userId]: 'merged' | 'declined' }
const LIB_KEY = 'ambertube:v1';
const PREF_KEY = 'ambertube:smart-autoplay';
const FEEDBACK_KEY = 'ambertube:reco-feedback';
const FOCUS_KEY = 'ambertube:focus:settings';
const LIB_SETTINGS: (keyof Settings)[] = ['bitrate', 'autoplay', 'authorizedChannels', 'visualizer', 'voiceLang'];
const RETRY = [5_000, 15_000, 30_000, 60_000, 120_000];
const POLL_MS = 90_000;
const PRUNE_EVERY = 86_400_000;

const slimTrack = (t: Track) => ({ ...snapshot(t), id: t.id, provider: t.provider, ...(t.videoId ? { videoId: t.videoId } : {}) }) as unknown as Track;
const slimFeedback = (f: Feedback): Feedback => ({ ...f, moreLike: (f.moreLike ?? []).map(slimTrack), lessLike: (f.lessLike ?? []).map(slimTrack) });

function flattenSettings(lib: Settings, prefs: { enabled: boolean; mode: string }, feedback: Feedback, focus: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of LIB_SETTINGS) out[`lib.${k}`] = lib[k];
  out['reco.prefs'] = { enabled: prefs.enabled, mode: prefs.mode };
  out['reco.feedback'] = slimFeedback(feedback);
  out['focus.settings'] = focus;
  return out;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/** The guest's data on this device, read straight from storage (the app may be showing the account). */
function readGuest(): LocalData {
  const lib = readJson<{ saved?: Track[]; history?: LocalData['history']; playlists?: Playlist[]; settings?: Partial<Settings> }>(LIB_KEY, {});
  const now = Date.now();
  const saved = (lib.saved ?? []).map((t, i) => (t.addedAt ? t : { ...t, addedAt: now - (i + 1) * 1000 }));
  const playlists = (lib.playlists ?? []).map((p) => ({ ...p, tracks: p.tracks.map((t, i) => (t.addedAt ? t : { ...t, addedAt: (p.createdAt || now) + i })) }));
  const history = (lib.history ?? []).filter((h) => h && 'entryId' in h);
  const listens = prune(readJson<ListenEvent[]>(LISTEN_KEY, []).filter((e) => e && e.trackId && e.track), now);
  const settings: Record<string, unknown> = {};
  if (lib.settings) for (const k of LIB_SETTINGS) if (lib.settings[k] !== undefined) settings[`lib.${k}`] = lib.settings[k];
  const prefs = readJson<{ enabled?: boolean; mode?: string } | null>(PREF_KEY, null);
  if (prefs) settings['reco.prefs'] = { enabled: prefs.enabled !== false, mode: prefs.mode ?? 'balanced' };
  const fb = readJson<Feedback | null>(FEEDBACK_KEY, null);
  if (fb) settings['reco.feedback'] = slimFeedback({ ...EMPTY_FEEDBACK, ...fb });
  const focus = readJson<unknown>(FOCUS_KEY, null);
  if (focus) settings['focus.settings'] = sanitizeFocusSettings(focus);
  return { saved, history, listens, searches: loadHistory(localStorage, SEARCH_HISTORY_KEY), playlists, settings };
}

const newId = () => `pl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function SyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const lib = useLibrary();
  const sh = useSearchHistory();
  const ls = useListeningStore();
  const reco = useRecommendations();
  const focus = useFocus();
  const toast = useToast();
  const scope = useScope();

  const [status, setStatus] = useState<SyncStatus>('off');
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [guestOffer, setGuestOffer] = useState<MigrationCounts | null>(null);
  const [guestAvailable, setGuestAvailable] = useState<MigrationCounts | null>(null);
  const [rejected, setRejected] = useState(0);

  // ---- the local data as the engine sees it ----
  const recoPrefs = useMemo(() => ({ enabled: reco.autoplay.enabled, mode: reco.autoplay.mode }), [reco.autoplay.enabled, reco.autoplay.mode]);
  const data = useMemo<LocalData & { scope: string }>(() => ({
    scope: lib.scope,
    saved: lib.saved, history: lib.history, playlists: lib.playlists, searches: sh.history, listens: ls.events,
    settings: flattenSettings(lib.settings, recoPrefs, ls.feedback, focus.settings),
  }), [lib.scope, lib.saved, lib.history, lib.playlists, lib.settings, sh.history, ls.events, ls.feedback, recoPrefs, focus.settings]);
  const dataRef = useRef(data);
  dataRef.current = data;
  const apis = useRef({ lib, sh, ls, reco, focus });
  apis.current = { lib, sh, ls, reco, focus };

  // resolves once the providers show `target` scope's data (they reload in their own effects)
  const waiters = useRef<{ scope: string; resolve: () => void }[]>([]);
  useLayoutEffect(() => {
    waiters.current = waiters.current.filter((w) => (w.scope === data.scope ? (w.resolve(), false) : true));
  });
  const ready = useCallback((target: string) => (dataRef.current.scope === target
    ? Promise.resolve()
    : new Promise<void>((resolve) => { waiters.current.push({ scope: target, resolve }); })), []);

  const applyRef = useRef<((d: LocalData, changes: Change[], now: number) => LocalData) | null>(null);
  const port = useMemo<LocalPort>(() => ({
    read: () => dataRef.current,
    write: (d, changes) => {
      const { lib: l, sh: s, ls: lst, reco: r, focus: f } = apis.current;
      const cur = dataRef.current;
      dataRef.current = { ...d, scope: cur.scope };
      const apply = applyRef.current;
      const libSettingsFrom = (base: Settings) => {
        const out = { ...base };
        for (const k of LIB_SETTINGS) if (d.settings[`lib.${k}`] !== undefined) (out as Record<string, unknown>)[k] = d.settings[`lib.${k}`];
        return out;
      };
      if (changes && apply) {
        // server changes are applied on top of whatever the state is NOW (a just-made edit survives)
        const empty: LocalData = { saved: [], history: [], listens: [], searches: [], playlists: [], settings: {} };
        const now = Date.now();
        const libCh = changes.filter((c) => c.table === 'favorites' || c.table === 'playlists' || c.table === 'playlist_tracks' || (c.table === 'listening_history' && c.key.startsWith('r-')));
        const libSet = changes.some((c) => c.table === 'user_settings' && c.key.startsWith('lib.'));
        if (libCh.length || libSet) {
          l.applySynced((st) => {
            const x = libCh.length ? apply({ ...empty, saved: st.saved, history: st.history, playlists: st.playlists }, libCh, now) : null;
            return { saved: x ? x.saved : st.saved, history: x ? x.history : st.history, playlists: x ? x.playlists : st.playlists, settings: libSet ? libSettingsFrom(st.settings) : st.settings };
          });
        }
        const sCh = changes.filter((c) => c.table === 'search_history');
        if (sCh.length) s.replaceSearches((prev) => apply({ ...empty, searches: prev }, sCh, now).searches);
        const lCh = changes.filter((c) => c.table === 'listening_history' && c.key.startsWith('l-'));
        const fbCh = changes.some((c) => c.table === 'user_settings' && c.key === 'reco.feedback');
        if (lCh.length || fbCh) {
          lst.replaceSynced({
            events: lCh.length ? (prev) => apply({ ...empty, listens: prev }, lCh, now).listens : undefined,
            feedback: fbCh ? (d.settings['reco.feedback'] as Feedback) : undefined,
          });
        }
      } else {
        l.applySynced({ saved: d.saved, history: d.history, playlists: d.playlists, settings: libSettingsFrom(l.settings) });
        if (d.searches !== cur.searches) s.replaceSearches(d.searches);
        const fb0 = d.settings['reco.feedback'] as Feedback | undefined;
        const fbChanged0 = fb0 && stableJson(fb0) !== stableJson(cur.settings['reco.feedback']);
        if (d.listens !== cur.listens || fbChanged0) lst.replaceSynced({ events: d.listens, feedback: fbChanged0 ? fb0 : undefined });
      }
      const touched = (k: string) => !changes || changes.some((c) => c.table === 'user_settings' && c.key === k);
      const p = touched('reco.prefs') ? (d.settings['reco.prefs'] as { enabled?: boolean; mode?: string } | undefined) : undefined;
      if (p && p.enabled !== r.autoplay.enabled && typeof p.enabled === 'boolean') r.setAutoplay(p.enabled);
      if (p && p.mode && p.mode !== r.autoplay.mode && ['similar', 'balanced', 'discovery'].includes(p.mode)) r.setMode(p.mode as 'balanced');
      const fs = touched('focus.settings') ? d.settings['focus.settings'] : undefined;
      if (fs && stableJson(fs) !== stableJson(f.settings)) f.updateSettings(sanitizeFocusSettings(fs));
    },
  }), []);

  // ---- engine lifecycle ----
  const engine = useRef<{ e: SyncEngine; uid: string; client: SupabaseClient; scope: string } | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef(0);
  const realtimeOk = useRef(false);
  const firstDone = useRef<string | null>(null);

  const saveMeta = useCallback(() => {
    const en = engine.current;
    if (!en) return;
    try {
      localStorage.setItem(scopedKey(META_KEY, en.scope), JSON.stringify(en.e.meta));
    } catch {
      /* storage full: the engine still works in memory */
    }
    setPending(en.e.pendingCount);
  }, []);

  const decisions = () => readJson<Record<string, string>>(DECISION_KEY, {});
  const checkGuest = useCallback(async (uid: string, offer: boolean) => {
    if (decisions()[uid] === 'merged') return setGuestAvailable(null);
    const { guestCounts, hasGuestData } = await loadSync();
    const g = readGuest();
    const counts = hasGuestData(g) ? guestCounts(g) : null;
    setGuestAvailable(counts);
    if (offer && counts && !decisions()[uid]) setGuestOffer(counts);
  }, []);

  const schedule = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    timer.current = setTimeout(() => void runSync(), ms);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runSync = useCallback(async (): Promise<void> => {
    const en = engine.current;
    if (!en) return;
    if (running.current) {
      again.current = true;
      return running.current;
    }
    if (timer.current) clearTimeout(timer.current);
    const job = (async () => {
      setStatus('syncing');
      try {
        await ready(en.scope);
        if (engine.current !== en) return;
        const result = await en.e.sync();
        if (engine.current !== en) return;
        if (result.rejected > 0) {
          toast(`${result.rejected} mục chưa được đồng bộ vì tài khoản đã đạt giới hạn (tối đa 5.000 bài yêu thích, 200 playlist, 5.000 bài trong playlist). Bỏ bớt để đồng bộ tiếp.`, { type: 'warning', duration: 8000 });
        }
        setRejected(en.e.rejectedCount);
        attempt.current = 0;
        setError(null);
        setStatus('synced');
        setLastSync(Date.now());
        saveMeta();
        if (firstDone.current !== en.uid) {
          firstDone.current = en.uid;
          void checkGuest(en.uid, true);
        }
        const meta = en.e.meta as SyncMeta & { lastPrune?: number };
        if (!meta.lastPrune || Date.now() - meta.lastPrune > PRUNE_EVERY) {
          meta.lastPrune = Date.now();
          void en.client.rpc('ambertube_prune_my_history', { keep_days: 180 }).then(() => undefined, () => undefined);
        }
      } catch (err) {
        if (engine.current !== en) return;
        saveMeta(); // keep what was already confirmed
        const e = err instanceof SyncError ? err : toSyncError({ message: (err as Error)?.message });
        // (account-limit refusals are handled inside the engine and never land here)
        if (e.kind === 'auth') {
          const { error: refreshErr } = await en.client.auth.refreshSession().catch((x) => ({ error: x }));
          if (!refreshErr) {
            schedule(500);
            return;
          }
          setStatus('expired');
          return;
        }
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setStatus(offline || e.kind === 'network' ? 'offline' : 'error');
        setError(e.message);
        schedule(RETRY[Math.min(attempt.current++, RETRY.length - 1)]);
      }
    })().finally(() => {
      running.current = null;
      if (again.current) {
        again.current = false;
        schedule(300);
      }
    });
    running.current = job;
    return job;
  }, [ready, saveMeta, checkGuest, schedule]);
  const runRef = useRef(runSync);
  runRef.current = runSync;

  useEffect(() => {
    const uid = auth.status === 'signed-in' ? auth.user?.id : null;
    if (!uid || scope !== userScope(uid)) {
      engine.current = null;
      setStatus(auth.status === 'expired' ? 'expired' : 'off');
      setGuestOffer(null);
      setPending(0);
      return;
    }
    let alive = true;
    let channel: RealtimeChannel | null = null;
    let client: SupabaseClient | null = null;
    Promise.all([auth.client(), loadSync()]).then(([c, lib]) => {
      if (!alive) return;
      client = c;
      const meta = { ...lib.emptyMeta(), ...readJson<Partial<SyncMeta>>(scopedKey(META_KEY, scope), {}) } as SyncMeta;
      applyRef.current = lib.applyChanges;
      engine.current = { e: new lib.SyncEngine(lib.supabaseRemote(c, uid), uid, port, meta), uid, client: c, scope };
      setPending(engine.current.e.pendingCount);
      void runRef.current();
      // other devices' changes arrive within a second or so
      channel = c.channel(`ambertube-sync-${uid}`);
      for (const table of ['favorites', 'listening_history', 'search_history', 'playlists', 'playlist_tracks', 'user_settings']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${uid}` }, () => schedule(800));
      }
      channel.subscribe((s) => { realtimeOk.current = s === 'SUBSCRIBED'; });
    }).catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
      engine.current = null;
      realtimeOk.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (channel && client) void client.removeChannel(channel);
    };
  }, [auth.status, auth.user?.id, scope, port, schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // a new session for the same account (signed in again after it expired, token refresh) → sync now
  useEffect(() => {
    if (engine.current && auth.user) void runRef.current();
  }, [auth.user]);

  // local changes → push soon (debounced, off the critical path)
  useEffect(() => {
    const en = engine.current;
    if (!en || data.scope !== en.scope) return;
    const id = setTimeout(() => {
      if (engine.current !== en) return;
      const n = en.e.scan();
      saveMeta();
      if (n > 0) void runRef.current();
    }, 1500);
    return () => clearTimeout(id);
  }, [data, saveMeta]);

  // back online / back to the tab / slow poll without Realtime
  useEffect(() => {
    const kick = () => engine.current && void runRef.current();
    const onVisible = () => document.visibilityState === 'visible' && kick();
    window.addEventListener('online', kick);
    document.addEventListener('visibilitychange', onVisible);
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible' && !realtimeOk.current) kick();
    }, POLL_MS);
    return () => {
      window.removeEventListener('online', kick);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(poll);
    };
  }, []);

  const flush = useCallback(async (ms = 4000) => {
    const en = engine.current;
    if (!en) return true;
    en.e.scan();
    if (!en.e.pendingCount) return true;
    await Promise.race([runRef.current().catch(() => undefined), new Promise((r) => setTimeout(r, ms))]);
    return en.e.pendingCount === 0;
  }, []);

  const decide = (uid: string, v: string) => {
    try {
      localStorage.setItem(DECISION_KEY, JSON.stringify({ ...decisions(), [uid]: v }));
    } catch {
      /* ignore */
    }
  };

  const api = useMemo<SyncApi>(() => ({
    status, lastSync, pending, rejected, error, guestOffer, guestAvailable,
    syncNow: () => runRef.current(),
    async usage() {
      const en = engine.current;
      if (!en) return null;
      const { data, error: err } = await en.client.rpc('ambertube_my_usage');
      return err || !data ? null : (data as Record<string, number>);
    },
    flush,
    async mergeGuest() {
      const en = engine.current;
      setGuestOffer(null);
      if (!en) return;
      const { guestCounts, mergeGuestInto } = await loadSync();
      const counts = guestCounts(readGuest());
      const { data: merged, skipped } = mergeGuestInto(port.read(), readGuest(), en.e.accountSettingKeys(), Date.now(), newId, ACCOUNT_LIMITS);
      port.write(merged);
      if (skipped) toast(`${skipped} mục không được gộp vì đã đạt giới hạn tài khoản (tối đa 5.000 bài yêu thích, 200 playlist, 5.000 bài trong playlist).`, { type: 'warning', duration: 7000 });
      decide(en.uid, 'merged');
      setGuestAvailable(null);
      en.e.scan();
      saveMeta();
      await runRef.current();
      toast(`Đã gộp ${counts.favorites} bài yêu thích, ${counts.playlists} playlist và lịch sử của máy này vào tài khoản`, { type: 'success' });
    },
    declineGuest() {
      const en = engine.current;
      if (en) decide(en.uid, 'declined');
      setGuestOffer(null);
    },
    laterGuest: () => setGuestOffer(null),
    offerGuest() {
      void loadSync().then(({ guestCounts }) => setGuestOffer(guestCounts(readGuest())));
    },
    async deleteCloudData() {
      const en = engine.current;
      if (!en) return;
      const at = new Date().toISOString();
      for (const t of ['playlist_tracks', 'playlists', 'favorites', 'listening_history', 'search_history'] as const) {
        const { error: err, status: st } = await en.client.from(t).update({ deleted: true, changed_at: at }).eq('user_id', en.uid).eq('deleted', false);
        if (err) throw toSyncError(err, st);
      }
      const { error: err, status: st } = await en.client.from('user_settings').delete().eq('user_id', en.uid);
      if (err) throw toSyncError(err, st);
      // this device: empty library, fresh sync state
      en.e.meta = { cursor: {}, base: {}, pending: {} };
      port.write({ saved: [], history: [], listens: [], searches: [], playlists: [], settings: {} });
      await runRef.current();
    },
  }), [status, lastSync, pending, rejected, error, guestOffer, guestAvailable, flush, port, saveMeta, toast, checkGuest]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSync(): SyncApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}

export { GUEST };
