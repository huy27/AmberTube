import { useEffect, useReducer, useState } from 'react';
import { diag, diagEntries, onDiag } from './audioDiag';
import { audioSession } from '../playback/audioSession';
import { usePlayer } from '../context/PlayerContext';

/** On-screen audio lifecycle log for device testing (?diag=1). Read-only; never captures audio. */
export default function DiagPanel() {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [open, setOpen] = useState(true);
  const p = usePlayer();
  useEffect(() => onDiag(tick), []);
  useEffect(() => {
    // environment snapshot + device changes (when the browser reports them)
    diag('env', { ua: navigator.userAgent, audioSessionApi: Boolean(audioSession()), speech: Boolean((window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition || (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition), mediaSession: 'mediaSession' in navigator });
    const md = navigator.mediaDevices;
    const onDev = () => diag('mediaDevices.devicechange');
    md?.addEventListener?.('devicechange', onDev);
    return () => md?.removeEventListener?.('devicechange', onDev);
  }, []);
  const s = audioSession();
  const rows = diagEntries().slice(-80).reverse();
  const copy = async () => {
    const text = JSON.stringify(diagEntries(), null, 1);
    try { await navigator.clipboard.writeText(text); diag('diag.copied'); } catch { window.prompt('Sao chép nhật ký', text); }
  };
  return (
    <div className={`diag${open ? '' : ' diag--min'}`} role="log" aria-label="Nhật ký âm thanh (chẩn đoán)">
      <div className="diag__bar">
        <strong>Chẩn đoán âm thanh</strong>
        <span>session: {s ? `${s.type}${s.state ? ` / ${s.state}` : ''}` : 'không hỗ trợ'} · phát: {p.isPlaying ? 'có' : 'không'} · trang: {document.visibilityState}</span>
        <button onClick={copy}>Sao chép</button>
        <button onClick={() => setOpen((o) => !o)}>{open ? 'Thu' : 'Mở'}</button>
      </div>
      {open && (
        <ol className="diag__list">
          {rows.map((e, i) => (
            <li key={`${e.t}-${i}`}><time>{(e.t / 1000).toFixed(1)}s</time> {e.event} {e.data ? JSON.stringify(e.data) : ''}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
