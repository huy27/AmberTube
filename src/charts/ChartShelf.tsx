import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import type { ChartSource } from '../types';
import Shelf from '../components/Shelf';
import ChartCard, { ChartCardSkeleton } from './ChartCard';
import { CHART_META, useChart, useChartActions } from './useChart';

/** Home shelf for one Last.fm chart. Hidden without a Last.fm key or when the chart is empty; errors stay local. */
export default function ChartShelf({ source }: { source: ChartSource }) {
  const chart = useChart(source, 20);
  const actions = useChartActions();
  if (!chart.enabled) return null;
  const { title, subtitle } = CHART_META[source];
  const action = <Link to={`/charts/${source}`} className="mood-shelf__all">Xem tất cả</Link>;
  if (chart.status === 'error') {
    return (
      <Shelf id={`sh-chart-${source}`} title={title} action={action}>
        <div className="artists-error" role="status">
          <AlertTriangle size={18} /> <span>{chart.error}</span>
          <button className="btn btn--ghost btn--sm" onClick={chart.retry}>Thử lại</button>
        </div>
      </Shelf>
    );
  }
  if (chart.status === 'ready' && chart.tracks.length === 0) return null;
  return (
    <Shelf id={`sh-chart-${source}`} title={title} subtitle={subtitle} action={action}>
      {chart.status === 'loading'
        ? Array.from({ length: 6 }).map((_, i) => <ChartCardSkeleton key={i} />)
        : chart.tracks.map((c) => (
          <ChartCard key={c.key} chart={c} busy={actions.busyKey === c.key}
            onPlay={() => void actions.play(c, chart.tracks)} onQueue={() => void actions.queue(c)} />
        ))}
    </Shelf>
  );
}
