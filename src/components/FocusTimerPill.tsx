import { Timer, Pause } from 'lucide-react';
import { useFocus, useFocusClock, formatClock, PHASE_LABEL } from '../focus/PomodoroController';
import { useOpenFocus } from '../hooks/useFocusNavigation';

/** Small live countdown in the top bar while a focus session is active outside Focus mode. */
export default function FocusTimerPill() {
  const { timer } = useFocus();
  const { remainingMs } = useFocusClock();
  const open = useOpenFocus();
  if (timer.status === 'idle') return null;
  return (
    <button className={`focus-pill focus-pill--${timer.phase}${timer.status === 'paused' ? ' is-paused' : ''}`} onClick={open}
      aria-label={`${PHASE_LABEL[timer.phase]}: còn ${formatClock(remainingMs)}${timer.status === 'paused' ? ' (đã tạm dừng)' : ''}. Mở chế độ Tập trung`}>
      {timer.status === 'paused' ? <Pause size={14} /> : <Timer size={14} />}
      <span className="focus-pill__time">{formatClock(remainingMs)}</span>
      <span className="focus-pill__label">{PHASE_LABEL[timer.phase]}</span>
    </button>
  );
}
