// Persistent store for listening events and recommendation feedback.
// Lives above the player so the player can report what was actually listened to.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Track } from '../types';
import { LISTEN_KEY, prune, type ListenEvent } from './listening';
import { EMPTY_FEEDBACK, channelKey, type Feedback } from './engine';
import { info } from './identity';

const FEEDBACK_KEY = 'ambertube:reco-feedback';

const slimTrack = (t: Track): Track => {
  const { src: _s, ...rest } = t;
  return rest;
};

function readEvents(): ListenEvent[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LISTEN_KEY) || '[]');
    return Array.isArray(raw) ? prune(raw.filter((e) => e && e.trackId && e.track), Date.now()) : [];
  } catch {
    return [];
  }
}
function readFeedback(): Feedback {
  try {
    return { ...EMPTY_FEEDBACK, ...JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '{}') };
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
}

const Ctx = createContext<ListeningApi | null>(null);

export function ListeningStoreProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<ListenEvent[]>(readEvents);
  const [feedback, setFeedback] = useState<Feedback>(readFeedback);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    try {
      localStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedback));
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
      localStorage.setItem(LISTEN_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setEvents(next);
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
      localStorage.removeItem(LISTEN_KEY);
      eventsRef.current = [];
      setEvents([]);
    },
    resetFeedback: () => setFeedback((f) => ({ ...EMPTY_FEEDBACK, styles: f.styles })),
  }), [events, feedback, recordListen]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useListeningStore(): ListeningApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useListeningStore must be used inside ListeningStoreProvider');
  return ctx;
}
