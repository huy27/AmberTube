import type React from 'react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  MoreHorizontal, ListStart, ListPlus, Heart, HeartOff, FolderPlus, ChevronRight, ChevronLeft, Link2, ExternalLink, Trash2, Plus, Radio, EyeOff, Ban, UserX, Users,
} from 'lucide-react';
import { useRecommendations } from '../recommend/RecommendationProvider';
import { useListeningStore } from '../recommend/ListeningStore';
import { info } from '../recommend/identity';
import type { Track } from '../types';
import { usePlayer } from '../context/PlayerContext';
import { useLibrary } from '../context/LibraryContext';
import { useToast } from '../context/ToastContext';
import { watchUrl } from '../services/youtube';
import { useDismiss } from '../hooks/useDismiss';

interface Props {
  track: Track;
  onRemove?: () => void;
  removeLabel?: string;
  showLabel?: boolean;
}

export default function MoreMenu({ track, onRemove, removeLabel = 'Xóa khỏi playlist', showLabel = true }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'main' | 'playlists'>('main');
  const [up, setUp] = useState(false);
  const [fit, setFit] = useState<{ maxHeight: number; alignLeft: boolean }>({ maxHeight: 470, alignLeft: false });
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const { playNext, addToQueue } = usePlayer();
  const { isSaved, toggleSaved, playlists, addToPlaylist, createPlaylist } = useLibrary();
  const toast = useToast();
  const { startRadio, startArtistRadio } = useRecommendations();
  const artist = info(track).artistDisplay || track.channel;
  const fb = useListeningStore();
  const url = watchUrl(track);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, root, close);

  useLayoutEffect(() => {
    if (!open || !root.current) return;
    // keep the menu inside the viewport on every screen: open towards the side with more room,
    // cap its height to that room (it scrolls inside), and align it left when the button is near the left edge
    const r = root.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 10;
    const above = r.top - 10;
    const goUp = below < 300 && above > below;
    setUp(goUp);
    setFit({ maxHeight: Math.max(160, Math.min(470, goUp ? above : below)), alignLeft: r.right < Math.min(250, window.innerWidth - 8) });
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, view]);

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url!);
      toast('Đã sao chép liên kết', { type: 'success', duration: 1800 });
    } catch {
      toast('Không truy cập được bộ nhớ tạm', { type: 'warning' });
    }
  };

  const newPlaylist = () => {
    const name = window.prompt('Tên playlist');
    if (name === null) return;
    addToPlaylist(createPlaylist(name), track);
    setOpen(false);
  };

  // arrow-key navigation between menu items
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div className="more" ref={root}>
      <button
        className={`more__btn${open ? ' is-open' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          setView('main');
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tùy chọn khác cho ${track.title}`}
      >
        {showLabel && <span>Thêm</span>}
        <MoreHorizontal size={18} />
      </button>

      {open && (
        <div ref={menu} className={`menu${up ? ' menu--up' : ''}${fit.alignLeft ? ' menu--left' : ''}`} style={{ maxHeight: fit.maxHeight }} role="menu" onClick={(e) => e.stopPropagation()} onKeyDown={onMenuKey}>
          {view === 'main' ? (
            <>
              <button role="menuitem" className="menu__item" onClick={run(() => playNext(track))}>
                <ListStart size={16} /> Phát tiếp theo
              </button>
              <button role="menuitem" className="menu__item" onClick={run(() => addToQueue(track))}>
                <ListPlus size={16} /> Thêm vào hàng đợi
              </button>
              {track.provider !== 'local' && (
                <button role="menuitem" className="menu__item" onClick={run(() => void startRadio(track))}>
                  <Radio size={16} /> Bắt đầu Radio
                </button>
              )}
              {track.provider !== 'local' && artist && (
                <button role="menuitem" className="menu__item" onClick={run(() => void startArtistRadio(artist, track))}>
                  <Users size={16} /> Radio nghệ sĩ {artist}
                </button>
              )}
              <div className="menu__sep" />
              <button role="menuitem" className="menu__item" onClick={run(() => toggleSaved(track))}>
                {isSaved(track.id) ? <HeartOff size={16} /> : <Heart size={16} />}
                {isSaved(track.id) ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
              </button>
              {track.provider !== 'local' && (
                <button role="menuitem" className="menu__item" onClick={() => setView('playlists')}>
                  <FolderPlus size={16} /> Thêm vào playlist <ChevronRight size={16} className="menu__chev" />
                </button>
              )}
              {track.provider !== 'local' && (
                <>
                  <div className="menu__sep" />
                  <button role="menuitem" className="menu__item" onClick={run(() => { fb.notInterested(track); toast('Đã ghi nhận: không quan tâm bài này', { duration: 2200 }); })}>
                    <EyeOff size={16} /> Không quan tâm
                  </button>
                  <button role="menuitem" className="menu__item" onClick={run(() => { fb.blockTrack(track); toast('Đã ghi nhận: không thích · sẽ không gợi ý bài này (mọi bản tải lên) nữa', { duration: 2200 }); })}>
                    <Ban size={16} /> Không thích bài này
                  </button>
                  <button role="menuitem" className="menu__item" onClick={run(() => { fb.blockArtist(track); toast(`Sẽ không gợi ý ${artist} nữa`, { duration: 2400 }); })}>
                    <UserX size={16} /> Không gợi ý nghệ sĩ này
                  </button>
                </>
              )}
              {url && (
                <>
                  <div className="menu__sep" />
                  <button role="menuitem" className="menu__item" onClick={run(copyLink)}>
                    <Link2 size={16} /> Sao chép liên kết
                  </button>
                  <a role="menuitem" className="menu__item" href={url} target="_blank" rel="noreferrer" onClick={close}>
                    <ExternalLink size={16} /> Mở trên YouTube
                  </a>
                </>
              )}
              {onRemove && (
                <>
                  <div className="menu__sep" />
                  <button role="menuitem" className="menu__item menu__item--danger" onClick={run(onRemove)}>
                    <Trash2 size={16} /> {removeLabel}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <button role="menuitem" className="menu__item menu__back" onClick={() => setView('main')}>
                <ChevronLeft size={16} /> Thêm vào playlist
              </button>
              <div className="menu__sep" />
              <div className="menu__scroll">
                {playlists.map((p) => (
                  <button key={p.id} role="menuitem" className="menu__item" onClick={run(() => addToPlaylist(p.id, track))}>
                    <span className="menu__dot" /> {p.name}
                    <span className="menu__meta">{p.tracks.length}</span>
                  </button>
                ))}
              </div>
              <div className="menu__sep" />
              <button role="menuitem" className="menu__item menu__item--accent" onClick={newPlaylist}>
                <Plus size={16} /> Playlist mới…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
