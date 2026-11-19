import { useCallback, useRef, useState } from 'react';
import type { ChartSource, ChartTrack, Track } from '../types';
import { getTopTracks } from '../services/lastfm';
import { usePaged } from '../lastfm/usePaged';
import { usePlayer } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';
import { mergeChartTracks } from './normalize';
import { cachedMatch, resolveChartTrack } from './resolve';

const fetchers: Record<ChartSource, (page: number, limit: number) => Promise<{ items: ChartTrack[]; totalPages: number }>> = {
  vietnam: (page, limit) => getTopTracks({ source: 'vietnam', page, limit }).then((r) => ({ items: r.tracks, totalPages: r.totalPages })),
  global: (page, limit) => getTopTracks({ source: 'global', page, limit }).then((r) => ({ items: r.tracks, totalPages: r.totalPages })),
};

export const CHART_META: Record<ChartSource, { title: string; subtitle: string }> = {
  vietnam: { title: 'Phổ biến tại Việt Nam', subtitle: 'Khám phá những bài hát được nghe nhiều tại Việt Nam.' },
  global: { title: 'Thịnh hành toàn cầu', subtitle: 'Khám phá những gì đang được yêu thích trên thế giới.' },
};

/** One Last.fm chart, paged independently of the other. */
export function useChart(source: ChartSource, pageSize = 20) {
  const p = usePaged<ChartTrack>(fetchers[source], mergeChartTracks, pageSize, 'Không tải được bảng xếp hạng.');
  return { ...p, tracks: p.items };
}

const RESOLVE_TIMEOUT = 15_000;
const withTimeout = <T,>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), RESOLVE_TIMEOUT))]);

/**
 * Play / queue chart songs: each is looked up on YouTube when chosen (never in bulk — search quota),
 * then handed to the existing player. Only the latest tap plays; earlier lookups still fill the cache.
 */
export function useChartActions() {
  const { playTrack, addToQueue } = usePlayer();
  const toast = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const seq = useRef(0);

  const resolve = useCallback(async (c: ChartTrack): Promise<Track | null | 'error'> => {
    try {
      const t = await withTimeout(resolveChartTrack(c));
      if (!t) toast(`Không tìm thấy “${c.title}” của ${c.artist} trên YouTube.`, { type: 'warning' });
      return t;
    } catch {
      toast('Không tìm được bài hát trên YouTube. Kiểm tra kết nối và thử lại.', { type: 'warning' });
      return 'error';
    }
  }, [toast]);

  const play = useCallback(async (c: ChartTrack, list: ChartTrack[]) => {
    const my = ++seq.current;
    setBusyKey(c.key);
    const t = await resolve(c);
    if (my !== seq.current) return; // a newer tap won
    setBusyKey(null);
    if (!t || t === 'error') return;
    // queue: this song, then the following chart songs that are already known (no extra searches)
    const i = list.findIndex((x) => x.key === c.key);
    const rest = list.slice(i + 1).map(cachedMatch).filter((x): x is Track => Boolean(x));
    const seen = new Set([t.id]);
    playTrack(t, [t, ...rest.filter((x) => !seen.has(x.id) && seen.add(x.id))]);
  }, [playTrack, resolve]);

  const queue = useCallback(async (c: ChartTrack) => {
    const t = await resolve(c);
    if (t && t !== 'error') addToQueue(t);
  }, [addToQueue, resolve]);

  return { play, queue, busyKey };
}
