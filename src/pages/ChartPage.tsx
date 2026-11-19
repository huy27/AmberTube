import { Navigate, useParams } from 'react-router-dom';
import { AlertTriangle, ListMusic } from 'lucide-react';
import type { ChartSource } from '../types';
import EmptyState from '../components/EmptyState';
import ChartCard, { ChartCardSkeleton } from '../charts/ChartCard';
import { CHART_META, useChart, useChartActions } from '../charts/useChart';
import { useNearBottom } from '../lastfm/usePaged';

const isSource = (s: string | undefined): s is ChartSource => s === 'vietnam' || s === 'global';

/** Full chart (Last.fm), 20 songs at a time: "Tải thêm" or scroll to the bottom. Each chart pages on its own. */
export default function ChartPage() {
  const { source } = useParams();
  if (!isSource(source)) return <Navigate to="/" replace />;
  return <ChartList key={source} source={source} />;
}

function ChartList({ source }: { source: ChartSource }) {
  const chart = useChart(source, 20);
  const actions = useChartActions();
  const sentinel = useNearBottom(chart.loadMore, [chart.status]);
  const { title, subtitle } = CHART_META[source];
  return (
    <section className="page">
      <h1 className="page-title">{title}</h1>
      <p className="page-sub">{subtitle} Xếp hạng theo Last.fm; chọn một bài để nghe trên YouTube.</p>
      {!chart.enabled ? (
        <EmptyState icon={ListMusic} title="Chưa bật bảng xếp hạng">Thêm <code>VITE_LASTFM_API_KEY</code> vào <code>.env</code> để xem bài hát thịnh hành.</EmptyState>
      ) : chart.status === 'error' ? (
        <EmptyState icon={AlertTriangle} title="Không tải được bảng xếp hạng" action={<button className="btn btn--ghost" onClick={chart.retry}>Thử lại</button>}>{chart.error}</EmptyState>
      ) : chart.status === 'ready' && chart.tracks.length === 0 ? (
        <EmptyState icon={ListMusic} title="Chưa có dữ liệu">Last.fm chưa có bảng xếp hạng này lúc này.</EmptyState>
      ) : (
        <>
          <div className="chart-grid">
            {chart.status === 'loading'
              ? Array.from({ length: 12 }).map((_, i) => <ChartCardSkeleton key={i} />)
              : chart.tracks.map((c) => (
                <ChartCard key={c.key} chart={c} busy={actions.busyKey === c.key}
                  onPlay={() => void actions.play(c, chart.tracks)} onQueue={() => void actions.queue(c)} />
              ))}
            {chart.loadingMore && Array.from({ length: 4 }).map((_, i) => <ChartCardSkeleton key={`m${i}`} />)}
          </div>
          {chart.status === 'ready' && chart.error && (
            <p className="notice" role="status">{chart.error} <button className="link-btn" onClick={chart.retry}>Thử lại</button></p>
          )}
          <div ref={sentinel} />
          {chart.hasMore && !chart.loadingMore && !chart.error && (
            <div className="load-more"><button className="btn btn--ghost" onClick={chart.loadMore}>Tải thêm bài hát</button></div>
          )}
        </>
      )}
    </section>
  );
}
