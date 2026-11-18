import { Link } from 'react-router-dom';
import { History, Play, Pause, Trash2, RotateCcw } from 'lucide-react';
import Artwork from '../components/Artwork';
import EmptyState from '../components/EmptyState';
import Equalizer from '../components/Equalizer';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { dayLabel, formatClock, formatTime } from '../services/format';
import type { HistoryEntry } from '../types';

export default function HistoryPage() {
  const { history, removeHistoryEntry, clearHistory } = useLibrary();
  const { playTrack, track: current, isPlaying } = usePlayer();

  const groups: { label: string; entries: HistoryEntry[] }[] = [];
  for (const h of history) {
    const label = dayLabel(h.playedAt);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.entries.push(h);
    else groups.push({ label, entries: [h] });
  }

  return (
    <section className="page">
      <div className="page-head">
        <h1 className="page-title">Lịch sử nghe</h1>
        {history.length > 0 && (
          <button className="btn btn--ghost" onClick={() => window.confirm('Xóa toàn bộ lịch sử nghe?') && clearHistory()}>
            <Trash2 size={15} /> Xóa lịch sử
          </button>
        )}
      </div>
      <p className="page-sub">Các bài đã nghe gần đây trên thiết bị này. Lịch sử chỉ lưu trên máy, không gửi đi đâu.</p>

      {history.length === 0 ? (
        <EmptyState icon={History} title="Chưa có lịch sử nghe" action={<Link to="/search" className="btn btn--ghost">Tìm nhạc</Link>}>
          Các bài bạn phát sẽ hiện ở đây kèm ngày giờ nghe.
        </EmptyState>
      ) : (
        groups.map((g) => (
          <div key={g.label} className="history-group">
            <h2 className="section-title">{g.label}</h2>
            <ul className="history-list">
              {g.entries.map((h) => {
                const isCur = current?.id === h.track.id;
                const gone = h.track.provider === 'local' && !h.track.src;
                return (
                  <li key={h.entryId} className={`history-item${isCur ? ' is-current' : ''}`}>
                    <div className="history-item__thumb">
                      <Artwork track={h.track} />
                      {isCur && isPlaying && <span className="queue__eq"><Equalizer /></span>}
                    </div>
                    <div className="history-item__meta">
                      <div className="history-item__title" title={h.track.title}>{h.track.title}</div>
                      <div className="history-item__sub">{h.track.channel}{h.track.duration ? ` · ${formatTime(h.track.duration)}` : ''}</div>
                    </div>
                    <time className="history-item__time" dateTime={new Date(h.playedAt).toISOString()} title={new Date(h.playedAt).toLocaleString()}>
                      {formatClock(h.playedAt)}
                    </time>
                    <div className="history-item__actions">
                      <button className="btn btn--outline btn--sm" onClick={() => playTrack(h.track)} disabled={gone}
                        title={gone ? 'File trên máy — hãy thêm lại trong Thư viện để phát' : undefined}>
                        {isCur && isPlaying ? <><Pause size={14} fill="currentColor" strokeWidth={0} /> Tạm dừng</> : isCur ? <><Play size={14} fill="currentColor" strokeWidth={0} /> Tiếp tục</> : <><RotateCcw size={14} /> Phát lại</>}
                      </button>
                      <button className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => removeHistoryEntry(h.entryId)} aria-label={`Xóa ${h.track.title} khỏi lịch sử`} title="Xóa khỏi lịch sử">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
