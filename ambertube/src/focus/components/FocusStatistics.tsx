import type { CSSProperties } from 'react';
import { Trophy } from 'lucide-react';
import { useFocus } from '../PomodoroController';
import { lastDays } from '../stats';

const DAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export default function FocusStatistics() {
  const { today, settings, sessionNumber, stats } = useFocus();
  const goalMin = settings.dailyGoal * settings.focusMin;
  const pct = Math.min(100, Math.round((today.sessions / settings.dailyGoal) * 100));
  const week = lastDays(stats, Date.now(), 7);
  const max = Math.max(goalMin, ...week.map((d) => d.minutes), 1);

  return (
    <section className="fm-card fm-stats" aria-label="Thống kê tập trung hôm nay">
      <header className="fm-card__head">
        <div>
          <h2>Hôm nay</h2>
          <p>Phiên hiện tại: #{sessionNumber}</p>
        </div>
        {pct >= 100 && <span className="fm-stats__trophy" title="Đã đạt mục tiêu hôm nay"><Trophy size={18} /></span>}
      </header>

      <div className="fm-stats__big">
        <span className="fm-stats__num">{today.sessions}</span>
        <span className="fm-stats__of">/ {settings.dailyGoal} phiên</span>
      </div>
      <div className="fm-meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ mục tiêu hôm nay">
        <div className="fm-meter__fill" style={{ width: `${pct}%` }} />
      </div>
      <dl className="fm-stats__list">
        <div><dt>Thời gian tập trung</dt><dd>{today.minutes} / {goalMin} phút</dd></div>
        <div><dt>Hoàn thành mục tiêu</dt><dd>{pct}%</dd></div>
      </dl>

      <div className="fm-week" aria-label="Số phút tập trung 7 ngày qua">
        {week.map((d) => {
          const day = DAY[new Date(`${d.key}T12:00:00`).getDay()];
          return (
            <div key={d.key} className="fm-week__day" title={`${d.key}: ${d.minutes} phút`}>
              <div className="fm-week__bar"><i style={{ '--h': `${(d.minutes / max) * 100}%` } as CSSProperties} /></div>
              <span>{day}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
