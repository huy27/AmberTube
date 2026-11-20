// Car View voice search: a full-screen "listening" view with big text, then large result cards the user
// taps to play (nothing plays by itself) — no keyboard, nothing small to read or hit.
// Music is paused while listening (mic and music don't mix). Once results are shown and the mic is released,
// the song that was playing continues until the user picks another one. On cancel / errors it stays paused
// and a big "Tiếp tục nhạc" button resumes it with one tap.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, X, RotateCcw, Play, Search, Loader2 } from 'lucide-react';
import type { Track } from '../types';
import Artwork from '../components/Artwork';
import { usePlayer } from '../context/PlayerContext';
import { useLibrary } from '../context/LibraryContext';
import { useSearchHistory } from '../search/SearchHistoryContext';
import { useUI } from '../context/UIContext';
import { useSpeechRecognition, type VoiceError } from '../hooks/useSpeechRecognition';
import { searchVideos } from '../services/youtube';
import { formatTime } from '../services/format';
import { rankForVoice } from './rank';

/** Ask the Car View voice search to start (mic buttons in the car bar, Now Playing, the search bar). */
export const openCarVoice = () => window.dispatchEvent(new CustomEvent('ambertube:voice'));

type Phase = 'closed' | 'listening' | 'searching' | 'results' | 'problem';

const PROBLEM: Record<VoiceError | 'none' | 'cancelled' | 'empty' | 'search', string> = {
  none: 'Chưa nghe rõ',
  cancelled: 'Đã hủy',
  empty: 'Không tìm thấy bài phù hợp',
  search: 'Không tìm được lúc này',
  'no-speech': 'Chưa nghe rõ',
  'not-allowed': 'Micro đang bị chặn',
  'audio-capture': 'Không tìm thấy micro',
  network: 'Cần kết nối Internet để nhận giọng nói',
  'language-not-supported': 'Ngôn ngữ này chưa được hỗ trợ',
  unknown: 'Nhận giọng nói bị gián đoạn',
};
const HINT: Partial<Record<keyof typeof PROBLEM, string>> = {
  'not-allowed': 'Cho phép micro trong cài đặt trang web của trình duyệt.',
  'language-not-supported': 'Thử đổi sang ngôn ngữ còn lại.',
  network: 'Kiểm tra kết nối mạng rồi thử lại.',
  search: 'Kiểm tra kết nối mạng rồi thử lại.',
};

export default function CarVoiceSearch() {
  const p = usePlayer();
  const { settings, updateSettings } = useLibrary();
  const history = useSearchHistory();
  const ui = useUI();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('closed');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [problem, setProblem] = useState<keyof typeof PROBLEM>('none');
  const pausedByUs = useRef(false);
  const textRef = useRef('');
  const phaseRef = useRef<Phase>('closed');
  phaseRef.current = phase;
  const seq = useRef(0);

  const showProblem = (k: keyof typeof PROBLEM) => {
    setProblem(k);
    setPhase('problem');
  };

  const search = useCallback(async (q: string) => {
    const my = ++seq.current;
    setQuery(q);
    setPhase('searching');
    history.addSearch(q);
    try {
      const r = await searchVideos(q);
      if (my !== seq.current) return;
      const ranked = rankForVoice(q, r.items).slice(0, 5);
      if (!ranked.length) return showProblem('empty');
      setResults(ranked);
      setPhase('results');
    } catch {
      if (my === seq.current) showProblem('search');
    }
  }, [history]);

  const voice = useSpeechRecognition({
    lang: settings.voiceLang,
    onTranscript: useCallback((t: string, isFinal: boolean) => {
      textRef.current = t;
      setText(t);
      if (isFinal && phaseRef.current === 'listening') void search(t.trim());
    }, [search]),
    onError: useCallback((err: VoiceError) => {
      if (phaseRef.current === 'listening') showProblem(err);
    }, []),
  });

  // listening ended without a final result (stopped early, or the browser gave up): use what was heard
  const wasListening = useRef(false);
  useEffect(() => {
    if (wasListening.current && !voice.listening && phase === 'listening') {
      const heard = textRef.current.trim();
      if (heard) void search(heard);
      else showProblem('none');
    }
    wasListening.current = voice.listening;
  }, [voice.listening, phase, search]);

  const start = useCallback(() => {
    if (!voice.supported) {
      // e.g. some car browsers: type instead (the music keeps playing). Now Playing covers the search bar.
      ui.setNowPlaying(false);
      window.dispatchEvent(new CustomEvent('ambertube:find', { detail: { voice: false } }));
      return;
    }
    seq.current++;
    if (p.isPlaying) {
      p.pause();
      pausedByUs.current = true;
    }
    textRef.current = '';
    setText('');
    setResults([]);
    setPhase('listening');
    voice.start();
  }, [voice, p, ui]);
  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => {
    const on = () => startRef.current();
    window.addEventListener('ambertube:voice', on);
    return () => window.removeEventListener('ambertube:voice', on);
  }, []);

  const close = useCallback(() => {
    seq.current++;
    voice.cancel();
    setPhase('closed');
  }, [voice]);

  const play = useCallback((t: Track) => {
    p.playTrack(t, results.length ? results : [t]);
    pausedByUs.current = false;
    close();
  }, [p, results, close]);

  const resume = () => {
    pausedByUs.current = false;
    p.play();
    close();
  };

  // results are on screen and the mic is released: carry on with the song we paused until the user picks one
  useEffect(() => {
    if (phase !== 'results' || voice.listening || !pausedByUs.current) return;
    pausedByUs.current = false;
    if (p.track && !p.isPlaying) p.play();
  }, [phase, voice.listening, p]);

  useEffect(() => () => voice.cancel(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'closed') return null;
  const canResume = pausedByUs.current && Boolean(p.track) && !p.isPlaying;
  const top = results[0];

  return (
    <div className={`cvoice cvoice--${phase}`} role="dialog" aria-modal="true" aria-label="Tìm bằng giọng nói">
      <button className="cvoice__close" onClick={close} aria-label="Đóng"><X size={28} /></button>

      {phase === 'listening' && (
        // tap anywhere = "I'm done talking"
        <div className="cvoice__listen" onClick={() => voice.stop()}>
          <div className="cvoice__mic" aria-hidden="true"><Mic size={56} /><i /><i /><i /></div>
          <p className="cvoice__heard" aria-live="polite">{text || (settings.voiceLang === 'vi-VN' ? 'Hãy nói tên bài hát hoặc ca sĩ…' : 'Say a song or an artist…')}</p>
          <div className="cvoice__actions" onClick={(e) => e.stopPropagation()}>
            <button className="cvoice__btn" onClick={() => updateSettings({ voiceLang: settings.voiceLang === 'vi-VN' ? 'en-US' : 'vi-VN' })} disabled={voice.listening}
              aria-label={`Ngôn ngữ: ${settings.voiceLang === 'vi-VN' ? 'Tiếng Việt' : 'Tiếng Anh'}`}>{settings.voiceLang === 'vi-VN' ? 'Tiếng Việt' : 'English'}</button>
            <button className="cvoice__btn cvoice__btn--ghost" onClick={() => { seq.current++; voice.cancel(); showProblem('cancelled'); }}>Hủy</button>
          </div>
          <p className="cvoice__tip">Chạm vào màn hình khi nói xong</p>
        </div>
      )}

      {phase === 'searching' && (
        <div className="cvoice__listen">
          <Loader2 size={56} className="spin cvoice__spin" />
          <p className="cvoice__heard">“{query}”</p>
        </div>
      )}

      {phase === 'results' && top && (
        <div className="cvoice__results">
          <p className="cvoice__q">“{query}”</p>
          <button className="cvoice__top" onClick={() => play(top)} aria-label={`Phát ${top.title}`}>
            <span className="cvoice__art"><Artwork track={top} /></span>
            <span className="cvoice__info">
              <strong>{top.title}</strong>
              <span>{top.channel}{top.duration ? ` · ${formatTime(top.duration)}` : ''}</span>
            </span>
            <span className="cvoice__play">
              <Play size={30} fill="currentColor" strokeWidth={0} />
            </span>
          </button>
          <div className="cvoice__bar">
            <span>Chọn bài để phát</span>
          </div>
          <div className="cvoice__more">
            {results.slice(1).map((t) => (
              <button key={t.id} className="cvoice__item" onClick={() => play(t)} aria-label={`Phát ${t.title}`}>
                <span className="cvoice__thumb"><Artwork track={t} small /></span>
                <span className="cvoice__itext"><strong>{t.title}</strong><span>{t.channel}</span></span>
              </button>
            ))}
          </div>
          <div className="cvoice__actions">
            <button className="cvoice__btn" onClick={start}><Mic size={22} /> Nói lại</button>
            <button className="cvoice__btn cvoice__btn--ghost" onClick={() => { close(); navigate(`/search?q=${encodeURIComponent(query)}`); }}><Search size={22} /> Tất cả kết quả</button>
            {canResume && <button className="cvoice__btn cvoice__btn--ghost" onClick={resume}><Play size={22} /> Tiếp tục nhạc</button>}
          </div>
        </div>
      )}

      {phase === 'problem' && (
        <div className="cvoice__listen">
          <p className="cvoice__heard">{PROBLEM[problem]}{problem === 'empty' && query ? ` cho “${query}”` : ''}</p>
          {HINT[problem] && <p className="cvoice__tip">{HINT[problem]}</p>}
          <div className="cvoice__actions cvoice__actions--big">
            <button className="cvoice__btn cvoice__btn--primary" onClick={start}><RotateCcw size={26} /> Nói lại</button>
            {canResume && <button className="cvoice__btn" onClick={resume}><Play size={26} fill="currentColor" strokeWidth={0} /> Tiếp tục nhạc</button>}
            <button className="cvoice__btn cvoice__btn--ghost" onClick={close}>Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}
