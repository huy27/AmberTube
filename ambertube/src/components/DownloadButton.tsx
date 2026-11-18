import { useNavigate } from 'react-router-dom';
import { Download, Check, Lock, Loader2 } from 'lucide-react';
import type { CSSProperties, MouseEvent } from 'react';
import type { Track } from '../types';
import { useLibrary } from '../context/LibraryContext';
import { downloadEligibility } from '../services/downloads';

export default function DownloadButton({ track, compact = false, variant }: { track: Track; compact?: boolean; variant?: 'mp3' }) {
  const { downloads, startDownload, settings } = useLibrary();
  const navigate = useNavigate();
  const job = downloads.find((d) => d.id === track.id);
  const eligibility = downloadEligibility(track, settings.authorizedChannels);

  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (job?.status === 'converting') return navigate('/downloads');
    if (job?.status === 'done') {
      if (job.url) window.open(job.url, '_blank', 'noopener');
      else navigate('/downloads');
      return;
    }
    startDownload(track);
  };

  const mp3 = variant === 'mp3';
  let icon = eligibility.ok ? <Download size={mp3 ? 12 : 16} /> : <Lock size={mp3 ? 12 : 15} />;
  let label = mp3 ? 'MP3' : 'Tải MP3';
  let cls = '';
  if (job?.status === 'converting') {
    icon = <Loader2 size={mp3 ? 12 : 16} className="spin" />;
    label = mp3 ? `${job.progress}%` : `Đang chuyển ${job.progress}%`;
    cls = ' is-busy';
  } else if (job?.status === 'done') {
    icon = <Check size={mp3 ? 12 : 16} />;
    label = mp3 ? 'Đã tải' : 'Đã tải';
    cls = ' is-done';
  }

  return (
    <button
      className={`dl-btn${cls}${eligibility.ok ? '' : ' is-locked'}${compact ? ' dl-btn--compact' : ''}${mp3 ? ' dl-btn--mp3' : ''}`}
      onClick={onClick}
      title={eligibility.ok ? 'Tải MP3' : eligibility.reason}
      aria-label={eligibility.ok ? (mp3 ? 'Tải MP3' : undefined) : `Tải MP3 (không khả dụng: ${eligibility.reason})`}
      style={job?.status === 'converting' ? ({ '--p': `${job.progress}%` } as CSSProperties) : undefined}
    >
      {icon}
      {!compact && <span>{label}</span>}
    </button>
  );
}
