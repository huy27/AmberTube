import { Check } from 'lucide-react';
import Popover from './Popover';
import { usePlayer } from '../context/PlayerContext';
import { formatSpeed } from '../playback/speeds';

export default function SpeedMenu({ align = 'center' }: { align?: 'left' | 'right' | 'center' }) {
  const { speeds, rate, effectiveRate, setRate, track } = usePlayer();
  const fixed = speeds.length === 1;
  return (
    <Popover
      className="speed"
      label={`Tốc độ phát: ${formatSpeed(effectiveRate)}`}
      active={effectiveRate !== 1}
      align={align}
      trigger={<span className="speed__value">{formatSpeed(effectiveRate)}</span>}
    >
      {(close) => (
        <>
          <div className="popover__title">Tốc độ phát</div>
          {speeds.map((s) => (
            <button
              key={s}
              role="menuitemradio"
              aria-checked={s === effectiveRate}
              className={`popover__item${s === effectiveRate ? ' is-selected' : ''}`}
              onClick={() => {
                setRate(s);
                close();
              }}
            >
              <span>{s === 1 ? 'Bình thường (1.0x)' : formatSpeed(s)}</span>
              {s === effectiveRate && <Check size={16} />}
            </button>
          ))}
          {fixed && track && <p className="popover__note">{track.isLive ? 'Phát trực tiếp chỉ hỗ trợ tốc độ bình thường.' : 'Nguồn này chỉ hỗ trợ tốc độ bình thường.'}</p>}
          {rate !== effectiveRate && !fixed && (
            <p className="popover__note">Tốc độ {formatSpeed(rate)} bạn chọn không có ở nguồn này.</p>
          )}
        </>
      )}
    </Popover>
  );
}
