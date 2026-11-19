import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SearchX, AlertTriangle } from 'lucide-react';
import VideoRow from '../components/VideoRow';
import TrackList from '../components/TrackList';
import { isSongLike } from '../recommend/identity';
import EmptyState from '../components/EmptyState';
import MoodGrid from '../components/MoodGrid';
import { searchVideos, hasYouTubeApi, type SearchResult } from '../services/youtube';
import type { Track } from '../types';
import { useSearchHistory } from '../search/SearchHistoryContext';

interface State {
  status: 'idle' | 'loading' | 'done' | 'error';
  items: Track[];
  next: string | null;
  source: SearchResult['source'] | null;
  error: string | null;
}

function SkeletonRow() {
  return (
    <div className="video-row video-row--skeleton" aria-hidden="true">
      <span className="tl-num"><span className="sk sk--line" style={{ width: 14, margin: 0 }} /></span>
      <div className="tl-title">
        <div className="video-row__thumb sk" />
        <div className="sk sk--line" style={{ width: '60%', margin: 0 }} />
      </div>
      <span className="tl-channel"><span className="sk sk--line sk--sm" style={{ width: '70%', margin: 0 }} /></span>
      <span className="tl-views" />
      <span className="tl-actions" />
    </div>
  );
}

type Filter = 'all' | 'songs' | 'videos';
const FILTERS: [Filter, string][] = [['all', 'Tất cả'], ['songs', 'Bài hát'], ['videos', 'Video']];

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const [state, setState] = useState<State>({ status: 'idle', items: [], next: null, source: null, error: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const { addSearch } = useSearchHistory();
  const [filter, setFilter] = useState<Filter>('all');
  useEffect(() => setFilter('all'), [q]);
  const counts = useMemo(() => {
    const songs = state.items.filter(isSongLike).length;
    return { all: state.items.length, songs, videos: state.items.length - songs };
  }, [state.items]);
  const shown = useMemo(
    () => (filter === 'all' ? state.items : state.items.filter((t) => (filter === 'songs') === isSongLike(t))),
    [state.items, filter],
  );

  // every executed search is remembered (pasted links too, so they can be replayed)
  useEffect(() => {
    if (q) addSearch(q);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!q) {
      setState({ status: 'idle', items: [], next: null, source: null, error: null });
      return;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, status: 'loading', error: null }));
    searchVideos(q, { signal: ctrl.signal })
      .then((r) => setState({ status: 'done', items: r.items, next: r.nextPageToken, source: r.source, error: null }))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setState({ status: 'error', items: [], next: null, source: null, error: err.message });
      });
    return () => ctrl.abort();
  }, [q]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const r = await searchVideos(q, { pageToken: state.next });
      setState((s) => {
        const seen = new Set(s.items.map((i) => i.id));
        return { ...s, items: [...s.items, ...r.items.filter((i) => !seen.has(i.id))], next: r.nextPageToken };
      });
    } catch (err) {
      setState((s) => ({ ...s, error: (err as Error).message }));
    } finally {
      setLoadingMore(false);
    }
  };

  if (!q) {
    return (
      <section className="page">
        <h1 className="page-title">Tìm kiếm</h1>
        <p className="page-sub">Tìm nhạc, mix và radio trực tiếp trên YouTube — gõ chữ, dùng micro hoặc dán link YouTube.</p>
        <h2 className="section-title section-title--first">Tâm trạng &amp; Khám phá</h2>
        <MoodGrid />
      </section>
    );
  }

  const ready = state.status === 'done' && state.items.length > 0;
  return (
    <section className="page">
      <div className="tl-header">
        {/* the query is already in the search box: keep the heading for screen readers only */}
        <h1 className="sr-only">Kết quả tìm kiếm cho “{q}”</h1>
        <div role="group" aria-label="Lọc kết quả" className="tl-filters">
          {FILTERS.map(([id, label]) => (
            <button key={id} type="button" className="tl-filter" aria-pressed={filter === id} onClick={() => setFilter(id)} disabled={!ready}>
              {label}{ready && <span className="tl-filter__n">{counts[id]}</span>}
            </button>
          ))}
        </div>
      </div>
      {state.source === 'demo' && !hasYouTubeApi && (
        <p className="notice">Danh mục demo — thêm YouTube API key vào <code>.env</code> để tìm trên YouTube.</p>
      )}

      {state.status === 'loading' && (
        <TrackList label="Đang tải kết quả">{Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}</TrackList>
      )}

      {state.status === 'error' && (
        <EmptyState icon={AlertTriangle} title="Tìm kiếm thất bại">{state.error}</EmptyState>
      )}

      {state.status === 'done' && state.items.length === 0 && (
        <EmptyState icon={SearchX} title="Không có kết quả">Thử tên bài hát, nghệ sĩ hoặc mix khác.</EmptyState>
      )}

      {ready && (
        <>
          {shown.length === 0 ? (
            <p className="muted">Không có kết quả thuộc mục này. <button className="link-btn" onClick={() => setFilter('all')}>Xem tất cả</button></p>
          ) : (
            <TrackList label="Kết quả tìm kiếm">
              {/* Clicking a row plays just that song (Smart Autoplay continues after it).
                  “Phát tất cả” is the explicit way to queue every shown result. */}
              {shown.map((t, i) => <VideoRow key={t.id} track={t} index={i + 1} />)}
            </TrackList>
          )}
          {state.next && (
            <div className="load-more">
              <button className="btn btn--ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Đang tải…' : 'Tải thêm kết quả'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
