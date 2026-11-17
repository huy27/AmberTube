import { useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Play, FolderOpen, FileMusic } from 'lucide-react';
import VideoRow from '../components/VideoRow';
import TrackList from '../components/TrackList';
import EmptyState from '../components/EmptyState';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';

type Tab = 'saved' | 'local';

export default function LibraryPage() {
  const { saved, toggleSaved, localTracks, addLocalFiles, removeLocalTrack } = useLibrary();
  const { playTrack } = usePlayer();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('saved');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = tab === 'saved' ? saved : localTracks;

  const add = (files: FileList | null) => {
    if (!files?.length) return;
    const n = addLocalFiles(files);
    if (n) {
      setTab('local');
      toast(`Đã thêm ${n} file — dùng được đến khi bạn đóng ứng dụng`, { type: 'success' });
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    add(e.dataTransfer.files);
  };

  return (
    <section className="page" onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <div className="page-head">
        <h1 className="page-title">Thư viện</h1>
        <div className="page-head__actions">
          <button className="btn btn--ghost" onClick={() => fileRef.current?.click()}><FolderOpen size={16} /> Thêm file nhạc</button>
          {list.length > 0 && (
            <button className="btn btn--primary" onClick={() => playTrack(list[0], list)}>
              <Play size={16} fill="currentColor" strokeWidth={0} /> Phát tất cả
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="audio/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'saved'} className={`tab${tab === 'saved' ? ' is-active' : ''}`} onClick={() => setTab('saved')}>
          Yêu thích <span className="tab__count">{saved.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'local'} className={`tab${tab === 'local' ? ' is-active' : ''}`} onClick={() => setTab('local')}>
          File trên máy <span className="tab__count">{localTracks.length}</span>
        </button>
      </div>

      {dragging && <div className="dropzone">Thả file nhạc vào đây để thêm</div>}

      {list.length === 0 ? (
        tab === 'saved' ? (
          <EmptyState icon={Heart} title="Chưa có bài yêu thích" action={<Link to="/search" className="btn btn--ghost">Tìm nhạc</Link>}>
            Bấm biểu tượng trái tim ở trình phát, hoặc chọn “Thêm vào yêu thích” trong menu Thêm.
          </EmptyState>
        ) : (
          <EmptyState icon={FileMusic} title="Chưa có file nào" action={<button className="btn btn--ghost" onClick={() => fileRef.current?.click()}><FolderOpen size={16} /> Chọn file</button>}>
            Nghe MP3 và các file âm thanh khác trên máy tính — chỉ âm thanh, có hiệu ứng theo nhạc thật. File không được tải lên đâu cả.
          </EmptyState>
        )
      ) : (
        <TrackList label={tab === 'saved' ? 'Bài yêu thích' : 'File trên máy'} showViews={tab === 'saved'}>
          {list.map((t, i) => (
            <VideoRow key={t.id} track={t} index={i + 1} list={list}
              onRemove={tab === 'saved' ? () => toggleSaved(t) : () => removeLocalTrack(t.id)}
              removeLabel={tab === 'saved' ? 'Bỏ yêu thích' : 'Xóa khỏi danh sách'} />
          ))}
        </TrackList>
      )}
    </section>
  );
}
