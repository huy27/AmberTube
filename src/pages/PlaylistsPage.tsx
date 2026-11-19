import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, ListMusic, Play, Pencil, Trash2, ChevronLeft, Shuffle } from 'lucide-react';
import type { FormEvent } from 'react';
import type { Playlist } from '../types';
import Artwork from '../components/Artwork';
import SceneArt from '../components/SceneArt';
import VideoRow from '../components/VideoRow';
import TrackList from '../components/TrackList';
import EmptyState from '../components/EmptyState';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { formatTime } from '../services/format';

function Cover({ playlist }: { playlist: Playlist }) {
  const t = playlist.tracks;
  if (t.length >= 4) {
    return <span className="pl-cover pl-cover--grid">{t.slice(0, 4).map((x) => <Artwork key={x.id} track={x} />)}</span>;
  }
  if (t.length > 0) return <span className="pl-cover"><Artwork track={t[0]} /></span>;
  return <span className="pl-cover"><SceneArt seed={playlist.id} variant="city" hue={(playlist.name.length * 37) % 360} /></span>;
}

export function PlaylistsPage() {
  const { playlists, createPlaylist } = useLibrary();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = createPlaylist(name);
    if (!id) return; // limit reached (a message was shown)
    setName('');
    setCreating(false);
    navigate(`/playlists/${id}`);
  };

  return (
    <section className="page">
      <div className="page-head">
        <h1 className="page-title">Playlist</h1>
        {!creating && (
          <button className="btn btn--primary" onClick={() => setCreating(true)}><Plus size={16} /> Playlist mới</button>
        )}
      </div>

      {creating && (
        <form className="inline-form" onSubmit={submit}>
          <input autoFocus className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên playlist" maxLength={60}
            onKeyDown={(e) => e.key === 'Escape' && setCreating(false)} />
          <button className="btn btn--primary" type="submit" disabled={!name.trim()}>Tạo</button>
          <button className="btn btn--ghost" type="button" onClick={() => setCreating(false)}>Hủy</button>
        </form>
      )}

      {playlists.length === 0 ? (
        <EmptyState icon={ListMusic} title="Chưa có playlist">Tạo một playlist, sau đó thêm bài từ menu Thêm.</EmptyState>
      ) : (
        <div className="card-grid">
          {playlists.map((p) => (
            <Link key={p.id} to={`/playlists/${p.id}`} className="card">
              <span className="card__thumb card__thumb--square"><Cover playlist={p} /></span>
              <span className="card__title">{p.name}</span>
              <span className="card__sub">{p.tracks.length} bài</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playlists, renamePlaylist, deletePlaylist, removeFromPlaylist } = useLibrary();
  const { playTrack, toggleShuffle, shuffle } = usePlayer();
  const pl = playlists.find((p) => p.id === id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pl?.name || '');

  if (!pl) {
    return (
      <section className="page">
        <EmptyState icon={ListMusic} title="Không tìm thấy playlist" action={<Link to="/playlists" className="btn btn--ghost">Quay lại Playlist</Link>} />
      </section>
    );
  }

  const total = pl.tracks.reduce((s, t) => s + (t.duration || 0), 0);

  return (
    <section className="page">
      <Link to="/playlists" className="back-link"><ChevronLeft size={16} /> Playlist</Link>
      <div className="pl-hero">
        <span className="pl-hero__cover"><Cover playlist={pl} /></span>
        <div className="pl-hero__body">
          <span className="eyebrow">Playlist</span>
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); renamePlaylist(pl.id, name.trim() || pl.name); setEditing(false); }}>
              <input autoFocus className="field field--title" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { renamePlaylist(pl.id, name.trim() || pl.name); setEditing(false); }} />
            </form>
          ) : (
            <h1 className="page-title page-title--hero">{pl.name}</h1>
          )}
          <p className="page-sub">{pl.tracks.length} bài{total ? ` · ${formatTime(total)}` : ''}</p>
          <div className="pl-hero__actions">
            <button className="btn btn--primary" disabled={!pl.tracks.length} onClick={() => playTrack(pl.tracks[0], pl.tracks)}>
              <Play size={16} fill="currentColor" strokeWidth={0} /> Phát
            </button>
            <button className={`icon-btn${shuffle ? ' is-active' : ''}`} onClick={toggleShuffle} aria-label="Trộn bài" title="Trộn bài"><Shuffle size={18} /></button>
            <button className="icon-btn" onClick={() => { setName(pl.name); setEditing(true); }} aria-label="Đổi tên" title="Đổi tên"><Pencil size={18} /></button>
            <button className="icon-btn icon-btn--danger" aria-label="Xóa playlist" title="Xóa playlist"
              onClick={() => { if (window.confirm(`Xóa “${pl.name}”?`)) { deletePlaylist(pl.id); navigate('/playlists'); } }}>
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </div>

      {pl.tracks.length === 0 ? (
        <EmptyState icon={ListMusic} title="Playlist này đang trống" action={<Link to="/search" className="btn btn--ghost">Tìm nhạc</Link>}>
          Mở menu Thêm ở bất kỳ video nào và chọn “Thêm vào playlist”.
        </EmptyState>
      ) : (
        <TrackList label={`Playlist ${pl.name}`}>
          {pl.tracks.map((t, i) => <VideoRow key={t.id} track={t} index={i + 1} list={pl.tracks} onRemove={() => removeFromPlaylist(pl.id, t.id)} />)}
        </TrackList>
      )}
    </section>
  );
}
