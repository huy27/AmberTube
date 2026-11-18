import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Download, X, Trash2, RotateCw, FileAudio, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { DownloadJob } from '../types';
import Artwork from '../components/Artwork';
import EmptyState from '../components/EmptyState';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';

function DownloadItem({ job }: { job: DownloadJob }) {
  const { cancelDownload, removeDownload, startDownload } = useLibrary();
  const { playTrack } = usePlayer();
  const { track, status, progress } = job;

  return (
    <div className={`dl-item dl-item--${status}`}>
      <button className="dl-item__thumb" onClick={() => playTrack(track)} aria-label={`Phát ${track.title}`}>
        <Artwork track={track} />
      </button>
      <div className="dl-item__body">
        <div className="dl-item__title">{track.title}</div>
        <div className="dl-item__sub">
          {track.channel} · MP3 {job.bitrate} kbps
          {status === 'done' && (job.url ? ' · Sẵn sàng để lưu' : ' · Chuyển đổi demo (không tạo file)')}
        </div>
        {status === 'converting' && (
          <div className="bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="bar__fill" style={{ width: `${progress}%` }} />
          </div>
        )}
        {status === 'error' && <div className="dl-item__error"><AlertCircle size={14} /> {job.error}</div>}
      </div>
      <div className="dl-item__status">
        {status === 'converting' && <span className="dl-item__pct">{progress}%</span>}
        {status === 'done' && <CheckCircle2 size={18} className="ok" />}
      </div>
      <div className="dl-item__actions">
        {status === 'converting' && (
          <button className="icon-btn icon-btn--sm" onClick={() => cancelDownload(job.id)} aria-label="Hủy"><X size={16} /></button>
        )}
        {status === 'done' && job.url && (
          <a className="btn btn--outline btn--sm" href={job.url} download={job.fileName ?? true}><FileAudio size={14} /> Lưu MP3</a>
        )}
        {status === 'error' && (
          <button className="icon-btn icon-btn--sm" onClick={() => startDownload(track)} aria-label="Thử lại"><RotateCw size={16} /></button>
        )}
        {status !== 'converting' && (
          <button className="icon-btn icon-btn--sm" onClick={() => removeDownload(job.id)} aria-label="Xóa"><Trash2 size={16} /></button>
        )}
      </div>
    </div>
  );
}

export default function DownloadsPage() {
  const { downloads, markDownloadsSeen, clearFinishedDownloads, unseenDownloads } = useLibrary();

  useEffect(() => {
    if (unseenDownloads) markDownloadsSeen();
  }, [unseenDownloads, markDownloadsSeen]);

  const active = downloads.filter((d) => d.status === 'converting');
  const finished = downloads.filter((d) => d.status !== 'converting');

  return (
    <section className="page">
      <div className="page-head">
        <h1 className="page-title">Tải xuống</h1>
        {finished.length > 0 && <button className="link-btn" onClick={clearFinishedDownloads}>Xóa mục đã xong</button>}
      </div>
      <p className="page-sub">Chỉ chuyển đổi MP3 cho nội dung bạn sở hữu hoặc được cấp phép tải. Nút có ổ khóa sẽ giải thích vì sao video không đủ điều kiện.</p>

      {downloads.length === 0 ? (
        <EmptyState icon={Download} title="Chưa có lượt tải nào" action={<Link to="/search" className="btn btn--ghost">Duyệt nhạc</Link>}>
          Bấm “Tải MP3” ở bài đủ điều kiện để chuyển đổi.
        </EmptyState>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <h2 className="section-title">Đang chuyển đổi <span className="section-title__count">{active.length}</span></h2>
              <div className="dl-list">{active.map((j) => <DownloadItem key={j.id} job={j} />)}</div>
            </>
          )}
          {finished.length > 0 && (
            <>
              <h2 className="section-title">Đã xong</h2>
              <div className="dl-list">{finished.map((j) => <DownloadItem key={j.id} job={j} />)}</div>
            </>
          )}
        </>
      )}
    </section>
  );
}
