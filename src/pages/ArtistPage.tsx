import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Music2, Radio } from 'lucide-react';
import type { Artist, Track } from '../types';
import ArtistAvatar from '../artists/ArtistAvatar';
import EmptyState from '../components/EmptyState';
import TrackList from '../components/TrackList';
import VideoRow from '../components/VideoRow';
import { getChannelThumbnails, hasYouTubeApi, searchMusic, searchVideos } from '../services/youtube';
import { useStoreImage } from '../lastfm/imageStore';
import { artistImages } from '../artists/artistImages';
import { normalize } from '../search/normalize';
import { useRecommendations } from '../recommend/RecommendationProvider';
import { dedupeSongs } from '../recommend/identity';
import { formatCount } from '../services/format';

/** Artist-focused discovery: Last.fm gives the chart position, YouTube provides the playable songs. */
export default function ArtistPage() {
  const { name: raw = '' } = useParams();
  const name = decodeURIComponent(raw);
  const fromChart = (useLocation().state as { artist?: Artist } | null)?.artist;
  const artist: Pick<Artist, 'name' | 'image'> & Partial<Artist> = fromChart?.name === name ? fromChart : { name, image: null };
  const { startArtistRadio } = useRecommendations();
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; items: Track[]; error?: string }>({ status: 'loading', items: [] });

  useEffect(() => {
    let current = true; // a newer artist page wins over a slower old request
    setState({ status: 'loading', items: [] });
    // Music-category search when the YouTube API is configured; demo catalogue otherwise
    (hasYouTubeApi ? searchMusic(name) : searchVideos(name).then((r) => r.items))
      .then((items) => current && setState({ status: 'ready', items: dedupeSongs(items.filter((t) => !t.unavailable)) }))
      .catch((e: Error) => current && setState({ status: 'error', items: [], error: e.message }));
    return () => { current = false; };
  }, [name]);

  // No photo on Wikimedia → use the artist's own YouTube channel picture (Topic or official channel of
  // one of their songs; channels.list costs 1 quota unit). Remembered, so the Home shelf shows it too.
  const photoReq = useMemo(() => (artist.image ? null : { name, mbid: artist.mbid ?? null }), [artist.image, artist.mbid, name]);
  const photo = useStoreImage(artistImages, photoReq);
  useEffect(() => {
    if (photo !== null || !photoReq || state.status !== 'ready' || !hasYouTubeApi) return;
    const n = normalize(name);
    const own = state.items.find((t) => t.channelId && normalize(t.channel.replace(/\s*-\s*topic$/i, '').replace(/\s*(official|offical)$/i, '')) === n);
    if (!own?.channelId) return;
    let current = true;
    getChannelThumbnails([own.channelId])
      .then((m) => { if (current && m[own.channelId!]) artistImages.set(artistImages.keyOf(photoReq), { url: m[own.channelId!], credit: { label: 'YouTube', href: `https://www.youtube.com/channel/${own.channelId}` } }); })
      .catch(() => { /* keep the monogram */ });
    return () => { current = false; };
  }, [photo, photoReq, state, name]);

  return (
    <section className="page">
      <header className="artist-hero">
        <ArtistAvatar artist={artist} size={120} />
        <div className="artist-hero__text">
          <p className="eyebrow">{artist.rank ? `#${artist.rank} tại Việt Nam · Last.fm` : 'Nghệ sĩ'}</p>
          <h1 className="artist-hero__name">{name}</h1>
          <p className="artist-hero__meta">
            {artist.listeners != null && <span>{formatCount(artist.listeners)} người nghe</span>}
            {artist.playcount != null && <span>{formatCount(artist.playcount)} lượt nghe</span>}
          </p>
          <div className="artist-hero__actions">
            <button className="btn btn--primary" onClick={() => void startArtistRadio(name, state.items[0])} disabled={!state.items.length}>
              <Radio size={16} /> Radio nghệ sĩ
            </button>
            {artist.url && <a className="btn btn--ghost" href={artist.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Last.fm</a>}
          </div>
          {photo?.credit && <a className="artist-hero__credit" href={photo.credit.href} target="_blank" rel="noreferrer">Ảnh: {photo.credit.label}</a>}
        </div>
      </header>

      <h2 className="section-title">Bài hát trên YouTube</h2>
      {state.status === 'error' ? (
        <EmptyState icon={AlertTriangle} title="Không tải được bài hát">{state.error}</EmptyState>
      ) : state.status === 'ready' && state.items.length === 0 ? (
        <EmptyState icon={Music2} title="Chưa tìm thấy bài hát">Không có video nào của {name} phát được trên YouTube.</EmptyState>
      ) : state.status === 'loading' ? (
        <div className="artist-loading" aria-busy="true">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="sk sk--line" style={{ height: 44, marginBottom: 12 }} />)}</div>
      ) : (
        <TrackList label={`Bài hát của ${name}`}>
          {/* like search results: a row plays that song; "Thêm vào hàng đợi" queues it */}
          {state.items.map((t, i) => <VideoRow key={t.id} track={t} index={i + 1} />)}
        </TrackList>
      )}
    </section>
  );
}
