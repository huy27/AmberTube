import { Fragment, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { X, Trash2, GripVertical, ListX, Ban, ThumbsUp, ThumbsDown, Sparkles, Loader2 } from 'lucide-react';
import AutoplayControls from './AutoplayControls';
import { useRecommendations } from '../recommend/RecommendationProvider';
import Artwork from './Artwork';
import Equalizer from './Equalizer';
import { usePlayer } from '../context/PlayerContext';
import { useUI } from '../context/UIContext';
import { formatTime } from '../services/format';

export default function QueuePanel() {
  const { queue, index, isPlaying, buffering, jumpTo, removeFromQueue, moveInQueue, clearQueue, failedIds, autoReasons, track } = usePlayer();
  const loading = buffering && isPlaying;
  const { moreLikeThis, lessLikeThis } = useRecommendations();
  const { panel, setPanel } = useUI();
  const open = panel === 'queue';
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const upcoming = Math.max(0, queue.length - index - 1);

  const onDragStart = (i: number) => (e: DragEvent) => {
    setDragFrom(i);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
  };
  const onDragOver = (i: number) => (e: DragEvent) => {
    if (dragFrom === null) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (dragFrom !== null && dropAt !== null) moveInQueue(dragFrom, dropAt > dragFrom ? dropAt - 1 : dropAt);
    setDragFrom(null);
    setDropAt(null);
  };

  // keyboard reordering: Alt+↑ / Alt+↓ on a focused row
  const onRowKey = (i: number) => (e: KeyboardEvent) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const to = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (to < 0 || to >= queue.length) return;
    moveInQueue(i, to);
    requestAnimationFrame(() => listRef.current?.querySelectorAll<HTMLElement>('.queue__main')[to]?.focus());
  };

  return (
    <aside className={`queue side-panel${open ? ' is-open' : ''}`} aria-hidden={!open} aria-label="Hàng đợi phát">
      <header className="queue__head">
        <div>
          <h2>Hàng đợi</h2>
          <p className="queue__count">{queue.length ? `${upcoming} bài tiếp theo · kéo để sắp xếp` : 'Trống'}</p>
        </div>
        <div className="queue__tools">
          {queue.length > 1 && (
            <button className="link-btn" onClick={clearQueue} tabIndex={open ? 0 : -1}><ListX size={15} /> Xóa hết</button>
          )}
          <button className="icon-btn icon-btn--sm" onClick={() => setPanel(null)} aria-label="Đóng hàng đợi" tabIndex={open ? 0 : -1}><X size={18} /></button>
        </div>
      </header>
      <div className="queue__auto">
        <AutoplayControls />
        {track && (
          <div className="queue__feedback">
            <button className="chip-btn" onClick={() => moreLikeThis(track)} tabIndex={open ? 0 : -1}><ThumbsUp size={14} /> Thêm bài như này</button>
            <button className="chip-btn" onClick={() => lessLikeThis(track)} tabIndex={open ? 0 : -1}><ThumbsDown size={14} /> Bớt bài như này</button>
          </div>
        )}
      </div>
      {queue.length === 0 ? (
        <p className="queue__empty">Hàng đợi đang trống. Hãy phát một bài, hoặc chọn “Thêm vào hàng đợi” / “Phát tiếp theo” trong menu Thêm.</p>
      ) : (
        <ol className="queue__list" ref={listRef} onDragLeave={(e) => e.currentTarget === e.target && setDropAt(null)}>
          {queue.map((t, i) => {
            const failed = failedIds.has(t.id) || t.unavailable;
            const reason = autoReasons.get(t.id);
            const firstAuto = i > index && reason && !(i - 1 > index && autoReasons.has(queue[i - 1].id));
            return (
              <Fragment key={t.id}>
              {i === index + 1 && !reason && <li className="queue__section" aria-hidden="true">Phát tiếp theo</li>}
              {firstAuto && <li className="queue__section queue__section--auto" aria-hidden="true"><Sparkles size={12} /> Gợi ý tự động</li>}
              <li
                className={[
                  'queue__item',
                  i === index && 'is-current',
                  i < index && 'is-past',
                  failed && 'is-failed',
                  dragFrom === i && 'is-dragging',
                  dropAt === i && 'drop-before',
                  dropAt === i + 1 && i === queue.length - 1 && 'drop-after',
                ].filter(Boolean).join(' ')}
                draggable
                onDragStart={onDragStart(i)}
                onDragOver={onDragOver(i)}
                onDrop={onDrop}
                onDragEnd={() => { setDragFrom(null); setDropAt(null); }}
              >
                <span className="queue__grip" aria-hidden="true"><GripVertical size={15} /></span>
                <button
                  className="queue__main"
                  onClick={() => jumpTo(i)}
                  onKeyDown={onRowKey(i)}
                  tabIndex={open ? 0 : -1}
                  aria-current={i === index ? 'true' : undefined}
                  aria-label={`${i === index ? 'Đang phát: ' : ''}${t.title}. Alt+↑ hoặc Alt+↓ để sắp xếp.`}
                >
                  <span className="queue__thumb">
                    <Artwork track={t} small />
                    {i === index && <span className="queue__eq">{loading ? <Loader2 size={18} className="spin" /> : <Equalizer paused={!isPlaying || !open} />}</span>}
                  </span>
                  <span className="queue__text">
                    <span className="queue__title">{t.title}</span>
                    <span className="queue__sub">
                      {failed ? <><Ban size={11} /> Không phát được</> : <>{i === index ? (loading ? 'Đang tải… · ' : 'Đang phát · ') : ''}{t.channel} · {t.isLive ? 'LIVE' : formatTime(t.duration)}</>}
                    </span>
                    {reason && !failed && i >= index && <span className="queue__reason" title="Vì sao bài này được gợi ý">{reason}</span>}
                  </span>
                </button>
                {i !== index && (
                  <button className="icon-btn icon-btn--sm queue__remove" onClick={() => removeFromQueue(t.id)} aria-label={`Xóa ${t.title} khỏi hàng đợi`} tabIndex={open ? 0 : -1}>
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
              </Fragment>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
