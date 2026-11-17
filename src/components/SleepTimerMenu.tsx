import { Moon, Check } from 'lucide-react';
import Popover from './Popover';
import { usePlayer, usePlayerTime } from '../context/PlayerContext';
import { formatCountdown } from '../services/format';

const OPTIONS = [15, 30, 45, 60];

export default function SleepTimerMenu({ align = 'center' }: { align?: 'left' | 'right' | 'center' }) {
  const { sleepTimer, setSleepTimer } = usePlayer();
  const { sleepRemaining } = usePlayerTime();
  const status =
    sleepTimer?.kind === 'time' && sleepRemaining !== null
      ? formatCountdown(sleepRemaining)
      : sleepTimer?.kind === 'track'
        ? 'Hết bài'
        : null;

  return (
    <Popover
      className="sleep"
      label={status ? `Hẹn giờ tắt: ${status}` : 'Hẹn giờ tắt'}
      active={Boolean(sleepTimer)}
      align={align}
      trigger={
        <>
          <Moon size={19} fill={sleepTimer ? 'currentColor' : 'none'} />
          {status && <span className="sleep__badge">{sleepTimer?.kind === 'track' ? '♪' : status}</span>}
        </>
      }
    >
      {(close) => (
        <>
          <div className="popover__title">Hẹn giờ tắt</div>
          {status && (
            <div className="sleep__status">
              <span>Tạm dừng {sleepTimer?.kind === 'track' ? 'khi hết bài' : `sau ${status}`}</span>
              <button className="btn btn--ghost btn--sm" onClick={() => { setSleepTimer(null); close(); }}>Hủy hẹn giờ</button>
            </div>
          )}
          {OPTIONS.map((m) => (
            <button key={m} role="menuitemradio" aria-checked={sleepTimer?.kind === 'time' && sleepTimer.minutes === m}
              className="popover__item" onClick={() => { setSleepTimer(m); close(); }}>
              <span>{m} phút</span>
              {sleepTimer?.kind === 'time' && sleepTimer.minutes === m && <Check size={16} />}
            </button>
          ))}
          <button role="menuitemradio" aria-checked={sleepTimer?.kind === 'track'} className="popover__item" onClick={() => { setSleepTimer('track'); close(); }}>
            <span>Hết bài hiện tại</span>
            {sleepTimer?.kind === 'track' && <Check size={16} />}
          </button>
        </>
      )}
    </Popover>
  );
}
