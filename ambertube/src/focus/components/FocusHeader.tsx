import { Play, Settings2, Maximize, Minimize, LogOut, AudioLines, ChartColumn } from 'lucide-react';
import { useFocus, PHASE_LABEL, useFocusClock, formatClock } from '../PomodoroController';
import { useUI } from '../../context/UIContext';
import { IconBtn } from '../../components/PlayerBar';

interface Props {
  onOpenSettings(): void;
  onToggleMixer(): void;
  onToggleStats(): void;
  mixerOpen: boolean;
  statsOpen: boolean;
  onExit(): void;
}

export default function FocusHeader({ onOpenSettings, onToggleMixer, onToggleStats, mixerOpen, statsOpen, onExit }: Props) {
  const { timer, sessionNumber } = useFocus();
  const { remainingMs } = useFocusClock();
  const ui = useUI();
  const status =
    timer.status === 'running' ? (timer.phase === 'focus' ? `Đang tập trung · Phiên ${sessionNumber}` : `Đang ${PHASE_LABEL[timer.phase].toLowerCase()}`)
      : timer.status === 'paused' ? `Đã tạm dừng · ${formatClock(remainingMs)}`
        : timer.phase === 'focus' ? 'Sẵn sàng tập trung' : `Sẵn sàng ${PHASE_LABEL[timer.phase].toLowerCase()}`;

  return (
    <header className="fm-header">
      <div className="fm-header__brand">
        <span className="brand__mark"><Play size={13} fill="currentColor" strokeWidth={0} /></span>
        <span className="fm-header__name">AmberTube</span>
        <span className="fm-header__mode">Tập trung</span>
      </div>

      <div className={`fm-status fm-status--${timer.status} fm-status--${timer.phase}`} role="status" aria-live="polite">
        <span className="fm-status__dot" />
        {status}
      </div>

      <div className="fm-header__actions">
        <IconBtn label="Âm thanh nền" active={mixerOpen} onClick={onToggleMixer} className="fm-only-compact"><AudioLines size={19} /></IconBtn>
        <IconBtn label="Thống kê hôm nay" active={statsOpen} onClick={onToggleStats} className="fm-only-compact"><ChartColumn size={19} /></IconBtn>
        <IconBtn label="Cài đặt Tập trung" onClick={onOpenSettings}><Settings2 size={19} /></IconBtn>
        <IconBtn label={ui.isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'} onClick={ui.toggleFullscreen} className="fm-hide-mobile">
          {ui.isFullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
        </IconBtn>
        <button className="btn btn--ghost btn--sm fm-exit" onClick={onExit} title="Thoát chế độ Tập trung (Esc)">
          <LogOut size={15} /> <span>Thoát</span>
        </button>
      </div>
    </header>
  );
}
