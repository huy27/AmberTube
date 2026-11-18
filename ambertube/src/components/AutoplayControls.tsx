import { RefreshCw, Sparkles, Loader2 } from 'lucide-react';
import { useRecommendations } from '../recommend/RecommendationProvider';
import type { RadioMode } from '../recommend/engine';

export const MODE_LABEL: Record<RadioMode, string> = { similar: 'Giống bài này', balanced: 'Cân bằng', discovery: 'Khám phá' };

/** Smart Autoplay switch + mode + refresh. Used in the queue panel and Car View. */
export default function AutoplayControls({ large = false }: { large?: boolean }) {
  const { autoplay, setAutoplay, setMode, refresh } = useRecommendations();
  return (
    <div className={`autoplay${large ? ' autoplay--large' : ''}`}>
      <div className="autoplay__row">
        <span className="autoplay__title"><Sparkles size={large ? 20 : 16} /> Tự phát bài gợi ý</span>
        <button role="switch" aria-checked={autoplay.enabled} aria-label="Tự phát bài gợi ý" className={`toggle${autoplay.enabled ? ' is-on' : ''}${large ? ' toggle--large' : ''}`}
          onClick={() => setAutoplay(!autoplay.enabled)}>
          <span className="toggle__knob" />
        </button>
      </div>
      {autoplay.enabled && (
        <div className="autoplay__row">
          <div className="seg" role="radiogroup" aria-label="Kiểu gợi ý">
            {(Object.keys(MODE_LABEL) as RadioMode[]).map((m) => (
              <button key={m} role="radio" aria-checked={autoplay.mode === m} className={`seg__btn${autoplay.mode === m ? ' is-active' : ''}`} onClick={() => setMode(m)}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <button className="icon-btn icon-btn--sm autoplay__refresh" onClick={refresh} aria-label="Làm mới gợi ý" title="Làm mới gợi ý" disabled={autoplay.status === 'loading'}>
            {autoplay.status === 'loading' ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          </button>
        </div>
      )}
      {autoplay.enabled && autoplay.status === 'empty' && <p className="autoplay__note">Chưa tìm thấy bài phù hợp để phát tiếp. Hãy thử chế độ khác hoặc tìm thêm nhạc.</p>}
      {autoplay.enabled && autoplay.status === 'error' && <p className="autoplay__note autoplay__note--warn">Không tải thêm được gợi ý từ YouTube (mạng hoặc hạn mức API). Đang dùng dữ liệu sẵn có.</p>}
    </div>
  );
}
