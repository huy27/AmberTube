import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { X, Upload, Music2, Crosshair, Trash2 } from 'lucide-react';
import { usePlayer, usePlayerTime } from '../context/PlayerContext';
import { useUI } from '../context/UIContext';
import { useToast } from '../context/ToastContext';
import { useLyrics } from '../hooks/useLyrics';
import { activeLineIndex } from '../services/lrc';
import { hasLyricsProvider, removeUserLyrics, saveUserLyrics, USER_SOURCE } from '../services/lyrics';

export default function LyricsPanel() {
  const { panel, setPanel } = useUI();
  const open = panel === 'lyrics';
  const { track, seek } = usePlayer();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const state = useLyrics(track, open, version);
  const fileRef = useRef<HTMLInputElement>(null);

  const importFile = async (file: File | undefined) => {
    if (!file || !track) return;
    const text = await file.text();
    const lyrics = saveUserLyrics(track.id, text);
    if (!lyrics) return toast('File này không có lời bài hát.', { type: 'warning' });
    toast(lyrics.synced ? 'Đã nhập lời đồng bộ' : 'Đã nhập lời (không đồng bộ thời gian)', { type: 'success' });
    setVersion((v) => v + 1);
  };

  const lyrics = state.status === 'ready' ? state.lyrics : null;

  return (
    <aside className={`lyrics side-panel${open ? ' is-open' : ''}`} aria-hidden={!open} aria-label="Lời bài hát">
      <header className="queue__head">
        <div>
          <h2>Lời bài hát</h2>
          <p className="queue__count">
            {lyrics && !lyrics.instrumental ? <>{lyrics.synced ? <span className="sync-badge">Đồng bộ</span> : 'Không đồng bộ'} · {lyrics.source}</> : track ? track.title : 'Chưa phát bài nào'}
          </p>
        </div>
        <div className="queue__tools">
          {track && (
            <button className="icon-btn icon-btn--sm" onClick={() => fileRef.current?.click()} aria-label="Nhập file lời (.lrc hoặc .txt)" title="Nhập .lrc / .txt" tabIndex={open ? 0 : -1}>
              <Upload size={16} />
            </button>
          )}
          {lyrics?.source === USER_SOURCE && track && (
            <button className="icon-btn icon-btn--sm" onClick={() => { removeUserLyrics(track.id); setVersion((v) => v + 1); }} aria-label="Xóa lời đã nhập" title="Xóa lời đã nhập" tabIndex={open ? 0 : -1}>
              <Trash2 size={15} />
            </button>
          )}
          <button className="icon-btn icon-btn--sm" onClick={() => setPanel(null)} aria-label="Đóng lời bài hát" tabIndex={open ? 0 : -1}><X size={18} /></button>
        </div>
        <input ref={fileRef} type="file" accept=".lrc,.txt,text/plain" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
      </header>

      {!track ? (
        <LyricsMessage title="Chưa phát bài nào">Phát một bài để xem lời ở đây.</LyricsMessage>
      ) : state.status === 'loading' || state.status === 'idle' ? (
        <div className="lyrics__loading" aria-busy="true">{[70, 55, 80, 45, 65].map((w, i) => <div key={i} className="sk sk--line" style={{ width: `${w}%` }} />)}</div>
      ) : state.status === 'error' ? (
        <LyricsMessage title="Không tải được lời bài hát">{state.message}</LyricsMessage>
      ) : !lyrics ? (
        <LyricsMessage title="Chưa có lời cho bài này" action={<button className="btn btn--outline btn--sm" onClick={() => fileRef.current?.click()} tabIndex={open ? 0 : -1}><Upload size={14} /> Nhập file .lrc</button>}>
          {hasLyricsProvider ? 'Dịch vụ lời bài hát không tìm thấy bài này.' : 'Chưa cấu hình dịch vụ lời bài hát có bản quyền.'} Nếu bạn có lời dạng file .lrc (đồng bộ) hoặc .txt, bạn có thể nhập vào.
        </LyricsMessage>
      ) : lyrics.instrumental ? (
        <LyricsMessage title="Nhạc không lời">Bài này không có lời — cứ thả mình vào âm nhạc nhé.</LyricsMessage>
      ) : (
        <LyricLines key={`${track.id}:${version}`} lines={lyrics.lines} synced={lyrics.synced} onSeek={seek} active={open} />
      )}
    </aside>
  );
}

function LyricsMessage({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="lyrics__empty">
      <div className="empty__icon"><Music2 size={26} strokeWidth={1.6} /></div>
      <h3 className="empty__title">{title}</h3>
      <p className="empty__text">{children}</p>
      {action}
    </div>
  );
}

interface LinesProps {
  lines: { time: number | null; text: string }[];
  synced: boolean;
  onSeek(t: number): void;
  active: boolean;
}

/** Scrollable lyric lines. Synced lyrics follow playback unless the user is scrolling manually. */
export function LyricLines({ lines, synced, onSeek, active }: LinesProps) {
  const { currentTime } = usePlayerTime();
  const current = synced ? activeLineIndex(lines, currentTime) : -1;
  const box = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const userScrollUntil = useRef(0);
  const programmatic = useRef(false);

  useEffect(() => {
    if (!synced || !follow || !active || current < 0) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-line="${current}"]`);
    if (!el || !box.current) return;
    programmatic.current = true;
    box.current.scrollTo({ top: el.offsetTop - box.current.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
    const id = setTimeout(() => (programmatic.current = false), 450);
    return () => clearTimeout(id);
  }, [current, follow, synced, active]);

  // resume following a few seconds after the user stops scrolling
  useEffect(() => {
    if (follow) return;
    const id = setInterval(() => Date.now() > userScrollUntil.current && setFollow(true), 1000);
    return () => clearInterval(id);
  }, [follow]);

  const onUserScroll = () => {
    if (programmatic.current || !synced) return;
    userScrollUntil.current = Date.now() + 5000;
    setFollow(false);
  };

  return (
    <div className="lyrics__wrap">
      <div className={`lyrics__lines${synced ? ' is-synced' : ''}`} ref={box} onWheel={onUserScroll} onTouchMove={onUserScroll} onKeyDown={onUserScroll} tabIndex={active ? 0 : -1} aria-label="Nội dung lời bài hát">
        {lines.map((l, i) =>
          synced && l.time !== null ? (
            <button
              key={i}
              data-line={i}
              className={`lyric${i === current ? ' is-active' : ''}${i < current ? ' is-past' : ''}${!l.text ? ' is-gap' : ''}`}
              onClick={() => onSeek(l.time!)}
              tabIndex={-1}
              aria-current={i === current ? 'true' : undefined}
            >
              {l.text || '♪'}
            </button>
          ) : (
            <p key={i} className={`lyric lyric--plain${!l.text ? ' is-gap' : ''}`}>{l.text || ' '}</p>
          ),
        )}
      </div>
      {synced && !follow && (
        <button className="btn btn--primary btn--sm lyrics__follow" onClick={() => setFollow(true)}>
          <Crosshair size={14} /> Về dòng đang hát
        </button>
      )}
    </div>
  );
}
