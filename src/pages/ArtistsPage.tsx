import { AlertTriangle, Users } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import ArtistCard, { ArtistCardSkeleton } from '../artists/ArtistCard';
import { useTopArtists } from '../artists/useTopArtists';
import { useNearBottom } from '../lastfm/usePaged';

/** All popular artists in Vietnam (Last.fm), 20 at a time: "Tải thêm" or scroll to the bottom. */
export default function ArtistsPage() {
  const top = useTopArtists(20);
  // reaching the bottom loads the next page (the button stays for keyboard / no-IntersectionObserver)
  const sentinel = useNearBottom(top.loadMore, [top.status]);

  return (
    <section className="page">
      <h1 className="page-title">Nghệ sĩ nổi bật tại Việt Nam</h1>
      <p className="page-sub">Xếp hạng theo số người nghe trên Last.fm. Chọn một nghệ sĩ để nghe nhạc của họ trên YouTube.</p>
      {!top.enabled ? (
        <EmptyState icon={Users} title="Chưa bật bảng xếp hạng nghệ sĩ">Thêm <code>VITE_LASTFM_API_KEY</code> vào <code>.env</code> để xem nghệ sĩ nổi bật.</EmptyState>
      ) : top.status === 'error' ? (
        <EmptyState icon={AlertTriangle} title="Không tải được danh sách" action={<button className="btn btn--ghost" onClick={top.retry}>Thử lại</button>}>{top.error}</EmptyState>
      ) : top.status === 'ready' && top.artists.length === 0 ? (
        <EmptyState icon={Users} title="Chưa có dữ liệu">Last.fm chưa có bảng xếp hạng nghệ sĩ cho Việt Nam lúc này.</EmptyState>
      ) : (
        <>
          <div className="artist-grid">
            {top.status === 'loading'
              ? Array.from({ length: 12 }).map((_, i) => <ArtistCardSkeleton key={i} />)
              : top.artists.map((a) => <ArtistCard key={a.name} artist={a} />)}
            {top.loadingMore && Array.from({ length: 6 }).map((_, i) => <ArtistCardSkeleton key={`m${i}`} />)}
          </div>
          {top.error && top.status === 'ready' && (
            <p className="notice" role="status">{top.error} <button className="link-btn" onClick={top.retry}>Thử lại</button></p>
          )}
          <div ref={sentinel} />
          {top.hasMore && !top.loadingMore && (
            <div className="load-more"><button className="btn btn--ghost" onClick={top.loadMore}>Tải thêm nghệ sĩ</button></div>
          )}
        </>
      )}
    </section>
  );
}
