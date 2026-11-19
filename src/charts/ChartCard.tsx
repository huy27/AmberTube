import { useRef } from 'react';
import { ListPlus } from 'lucide-react';
import type { ChartTrack, Track } from '../types';
import RecoCard from '../components/RecoCard';
import MoreMenu from '../components/MoreMenu';
import { formatCount } from '../services/format';
import { cachedMatch } from './resolve';
import { trackArt } from './trackArt';
import { useStoreImage } from '../lastfm/imageStore';

/** A chart song shown as a stand-in Track until it is found on YouTube (Last.fm artwork, or an illustrated scene). */
function standIn(c: ChartTrack): Track {
  return {
    id: `chart:${c.key}`, provider: 'youtube', title: c.title, channel: c.artist, channelId: null,
    views: null, duration: 0, isLive: false, license: 'standard', tags: [], thumbnail: c.image ?? undefined,
    art: { variant: (['city', 'window', 'sea', 'desk', 'rain'] as const)[c.rank % 5], hue: (c.rank * 47) % 360 },
  };
}

/**
 * Reuses the recommendation card: rank badge, artist + listeners, YouTube lookup on tap.
 * Artwork: the album cover from Last.fm (fetched when the card scrolls into view) › the YouTube thumbnail
 * once the song has been found › an illustrated placeholder.
 */
export default function ChartCard({ chart, busy, onPlay, onQueue }: { chart: ChartTrack; busy: boolean; onPlay: () => void; onQueue: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cover = useStoreImage(trackArt, chart.image ? null : chart, ref);
  const found = cachedMatch(chart);
  const art = chart.image ?? cover?.url ?? found?.thumbnail;
  const base = found ? { ...found, title: chart.title } : standIn(chart);
  const shown: Track = { ...base, thumbnail: art ?? undefined };
  const listeners = chart.listeners != null ? ` · ${formatCount(chart.listeners)} người nghe` : '';
  const menu = found
    ? <MoreMenu track={found} showLabel={false} />
    : <button className="more__btn" onClick={onQueue} aria-label={`Thêm ${chart.title} vào hàng đợi`} title="Thêm vào hàng đợi"><ListPlus size={18} /></button>;
  return (
    <RecoCard cardRef={ref} square track={shown} note={`${chart.artist}${listeners}`} rank={chart.rank} busy={busy} onPlay={onPlay} menu={menu} label={`${chart.title} – ${chart.artist}`} />
  );
}

export function ChartCardSkeleton() {
  return (
    <div className="reco-card reco-card--square reco-card--sk" aria-hidden="true">
      <div className="reco-card__main"><span className="reco-card__thumb sk" /><span className="sk sk--line" /><span className="sk sk--line sk--sm" style={{ width: '60%' }} /></div>
    </div>
  );
}
