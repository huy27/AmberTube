import { useEffect, useRef } from 'react';
import { Check, Coffee, Target, X } from 'lucide-react';
import { useFocus, PHASE_LABEL } from '../PomodoroController';

export default function SessionCompletionDialog() {
  const f = useFocus();
  const t = f.completion;
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!t) return;
    primaryRef.current?.focus({ preventScroll: true });
    // auto-close when the next session already started on its own
    if (t.autoStarted) {
      const id = setTimeout(f.dismissCompletion, 12_000);
      return () => clearTimeout(id);
    }
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!t) return null;
  const focusDone = t.completed === 'focus';
  const nextLabel = PHASE_LABEL[t.next].toLowerCase();

  return (
    <div className="fm-done-wrap">
      <div className={`fm-done${focusDone ? ' fm-done--focus' : ' fm-done--break'}`} role="dialog" aria-modal="false" aria-labelledby="fm-done-title">
        <button className="icon-btn icon-btn--sm fm-done__close" onClick={f.dismissCompletion} aria-label="Đóng"><X size={16} /></button>
        <div className="fm-done__badge" aria-hidden="true">
          <span className="fm-done__burst" />
          {focusDone ? <Check size={30} strokeWidth={3} /> : <Target size={28} />}
        </div>
        <h2 id="fm-done-title">{focusDone ? 'Tuyệt vời! Bạn đã hoàn thành phiên tập trung.' : 'Hết giờ nghỉ rồi!'}</h2>
        <p>
          {focusDone
            ? `Hôm nay: ${f.today.sessions}/${f.settings.dailyGoal} phiên · ${f.today.minutes} phút tập trung.`
            : 'Nạp lại năng lượng xong — sẵn sàng cho phiên tiếp theo chứ?'}
          {t.autoStarted && <> {focusDone ? `${PHASE_LABEL[t.next]} đã tự động bắt đầu.` : 'Phiên tập trung mới đã tự động bắt đầu.'}</>}
        </p>
        <div className="fm-done__actions">
          {focusDone ? (
            t.autoStarted ? (
              <>
                <button ref={primaryRef} className="btn btn--primary" onClick={f.dismissCompletion}><Coffee size={16} /> Tiếp tục nghỉ</button>
                <button className="btn btn--ghost" onClick={() => f.startPhase('focus')}><Target size={16} /> Bỏ nghỉ, tập trung tiếp</button>
              </>
            ) : (
              <>
                <button ref={primaryRef} className="btn btn--primary" onClick={() => f.startPhase(t.next)}><Coffee size={16} /> Bắt đầu {nextLabel}</button>
                <button className="btn btn--ghost" onClick={() => f.startPhase('focus')}><Target size={16} /> Tiếp tục tập trung</button>
              </>
            )
          ) : t.autoStarted ? (
            <button ref={primaryRef} className="btn btn--primary" onClick={f.dismissCompletion}>Đã hiểu</button>
          ) : (
            <>
              <button ref={primaryRef} className="btn btn--primary" onClick={() => f.startPhase('focus')}><Target size={16} /> Bắt đầu tập trung</button>
              <button className="btn btn--ghost" onClick={f.dismissCompletion}>Để sau</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
