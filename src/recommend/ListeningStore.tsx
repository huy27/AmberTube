// Persistent store for listening events and recommendation feedback.
// Lives above the player so the player can report what was actually listened to.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Track } from '../types';
import { LISTEN_KEY, prune, type ListenEvent } from './listening';
import { EMPTY_FEEDBACK, channelKey, type Feedback } from './engine';
import { info } from './identity';
import { scopedKey, useScope } from '../sync/scope';

const FEEDBACK_KEY = 'ambertube:reco-feedback';

const slimTrack = (t: Track): Track => {
  const { src: _s, ...rest } = t;
  return rest;
};

function readEvents(scope?: string): ListenEvent[] {
  try {
    const raw = JSON.parse(localStorage.getItem(scopedKey(LISTEN_KEY, scope)) || '[]');
    return Array.isArray(raw) ? prune(raw.filter((e) => e && e.trackId && e.track), Date.now()) : [];
  } catch {
    return [];
  }
}
function readFeedback(scope?: string): Feedback {
  try {
    return { ...EMPTY_FEEDBACK, ...JSON.parse(localStorage.getItem(scopedKey(FEEDBACK_KEY, scope)) || '{}') };
  } catch {
    return EMPTY_FEEDBACK;
  }
}

interface ListeningApi {
  events: ListenEvent[];
  feedback: Feedback;
  recordListen(e: ListenEvent): void;
  notInterested(t: Track): void;
  blockTrack(t: Track): void;
  blockArtist(t: Track): void;
  unblockArtist(name: string): void;
  setStyles(styles: string[]): void;
  moreLikeThis(t: Track): void;
  lessLikeThis(t: Track): void;
  clearListening(): void;
  resetFeedback(): void;
  /** Replace with the account's data (sync engine only). */
  replaceSynced(data: { events?: ListenEvent[] | ((cur: ListenEvent[]) => ListenEvent[]); feedback?: Feedback }): void;
}

const Ctx = createContext<ListeningApi | null>(null);

export function ListeningStoreProvider({ children }: { children: ReactNode }) {
  const scope = useScope();
  const [events, setEvents] = useState<ListenEvent[]>(() => readEvents());
  const [feedback, setFeedback] = useState<Feedback>(() => readFeedback());
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const scopeRef = useRef(scope);

  // signed in / out: that scope's listening history and feedback
  useEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    const ev = readEvents(scope);
    eventsRef.current = ev;
    setEvents(ev);
    setFeedback(readFeedback(scope));
  }, [scope]);

  useEffect(() => {
    try {
      localStorage.setItem(scopedKey(FEEDBACK_KEY, scopeRef.current), JSON.stringify(feedback));
    } catch {
      /* ignore */
    }
  }, [feedback]);

  const recordListen = useCallback((e: ListenEvent) => {
    if (eventsRef.current.some((x) => x.id === e.id)) return; // never count the same playback twice
    const { tags: _t, src: _s, ...track } = e.track;
    const next = prune([...eventsRef.current, { ...e, track }], Date.now());
    eventsRef.current = next;
    // written synchronously so a listen reported while the page closes is not lost
    try {
      localStorage.setItem(scopedKey(LISTEN_KEY, scopeRef.current), JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setEvents(next);
  }, []);

  const replaceSynced = useCallback((data: { events?: ListenEvent[] | ((cur: ListenEvent[]) => ListenEvent[]); feedback?: Feedback }) => {
    if (data.events) {
      const next = typeof data.events === 'function' ? data.events(eventsRef.current) : data.events;
      eventsRef.current = next;
      try {
        localStorage.setItem(scopedKey(LISTEN_KEY, scopeRef.current), JSON.stringify(next));
      } catch {
        /* ignore */
      }
      setEvents(next);
    }
    if (data.feedback) setFeedback({ ...EMPTY_FEEDBACK, ...data.feedback });
  }, []);

  const value = useMemo<ListeningApi>(() => ({
    events,
    feedback,
    recordListen,
    notInterested: (t) => setFeedback((f) => ({ ...f, notInterested: { ...f.notInterested, [t.id]: Date.now() } })),
    // "Dislike": never recommend this song again (any upload of it) and lean slightly away from it
    blockTrack: (t) => setFeedback((f) => ({
      ...f,
      blockedTracks: [...new Set([...f.blockedTracks, t.id])],
      dislikedSongs: [...new Set([...(f.dislikedSongs ?? []), info(t).key])],
      lessLike: [slimTrack(t), ...(f.lessLike ?? []).filter((x) => x.id !== t.id)].slice(0, 50),
    })),
    blockArtist: (t) => setFeedback((f) => ({ ...f, blockedChannels: [...new Set([...f.blockedChannels, channelKey(t)])] })),
    unblockArtist: (name) => setFeedback((f) => ({ ...f, blockedChannels: f.blockedChannels.filter((c) => c !== name) })),
    setStyles: (styles) => setFeedback((f) => ({ ...f, styles })),
    moreLikeThis: (t) => setFeedback((f) => ({ ...f, moreLike: [slimTrack(t), ...(f.moreLike ?? []).filter((x) => x.id !== t.id)].slice(0, 50), lessLike: (f.lessLike ?? []).filter((x) => x.id !== t.id) })),
    lessLikeThis: (t) => setFeedback((f) => ({ ...f, lessLike: [slimTrack(t), ...(f.lessLike ?? []).filter((x) => x.id !== t.id)].slice(0, 50), moreLike: (f.moreLike ?? []).filter((x) => x.id !== t.id) })),
    clearListening: () => {
      localStorage.removeItem(scopedKey(LISTEN_KEY, scopeRef.current));
      eventsRef.current = [];
      setEvents([]);
    },
    resetFeedback: () => setFeedback((f) => ({ ...EMPTY_FEEDBACK, styles: f.styles })),
    replaceSynced,
  }), [events, feedback, recordListen, replaceSynced]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useListeningStore(): ListeningApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useListeningStore must be used inside ListeningStoreProvider');
  return ctx;
}
