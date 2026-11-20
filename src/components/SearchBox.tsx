import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X, Mic, MicOff, History, TrendingUp, Music2, User, Video, Tv, Loader2, CornerDownLeft, AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Artwork from './Artwork';
import { useSpeechRecognition, VOICE_ERROR_MESSAGES, type VoiceError } from '../hooks/useSpeechRecognition';
import { openCarVoice } from '../voice/CarVoiceSearch';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';
import { useDisplayMode } from '../context/DisplayModeContext';
import { useSearchHistory } from '../search/SearchHistoryContext';
import { useSuggestions } from '../search/useSuggestions';
import { highlightRanges } from '../search/normalize';
import type { Suggestion, SuggestionKind } from '../search/suggest';

const KIND: Record<SuggestionKind, { icon: LucideIcon; label: string }> = {
  recent: { icon: History, label: 'Đã tìm' },
  query: { icon: Search, label: 'Tìm kiếm' },
  song: { icon: Music2, label: 'Bài hát' },
  artist: { icon: User, label: 'Nghệ sĩ' },
  video: { icon: Video, label: 'Video' },
  channel: { icon: Tv, label: 'Kênh' },
  trending: { icon: TrendingUp, label: 'Thịnh hành' },
};

function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = highlightRanges(text, query);
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let i = 0;
  ranges.forEach(([a, b], k) => {
    if (a > i) parts.push(text.slice(i, a));
    parts.push(<mark key={k}>{text.slice(a, b)}</mark>);
    i = b;
  });
  if (i < text.length) parts.push(text.slice(i));
  return <>{parts}</>;
}

/** Search input with voice search and an accessible autocomplete dropdown (ARIA combobox). */
export default function SearchBox() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const urlQuery = location.pathname === '/search' ? params.get('q') || '' : '';
  const [value, setValue] = useState(urlQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [heard, setHeard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const before = useRef('');
  const quietFocus = useRef(false); // programmatic focus shouldn't pop the dropdown over the page
  const listId = useId();
  const { settings, updateSettings } = useLibrary();
  const { playTrack, pause, isPlaying } = usePlayer();
  const playerRef = useRef({ pause, isPlaying });
  playerRef.current = { pause, isPlaying };
  const toast = useToast();
  const { compact } = useDisplayMode();
  const { history, removeSearch, clearSearches } = useSearchHistory();
  const { items, status, trendingSource } = useSuggestions(value, open, compact);

  useEffect(() => setValue(urlQuery), [urlQuery]);
  useEffect(() => setActive(-1), [items]);

  // ---- voice ----
  const voice = useSpeechRecognition({
    lang: settings.voiceLang,
    onTranscript: useCallback((text: string, isFinal: boolean) => {
      setValue(text);
      if (isFinal) {
        setHeard(true);
        setOpen(true);
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          const len = inputRef.current?.value.length ?? 0;
          inputRef.current?.setSelectionRange(len, len);
        });
      }
    }, []),
    onError: useCallback((err: VoiceError) => {
      setValue((v) => v || before.current);
      toast(VOICE_ERROR_MESSAGES[err], { type: 'warning', duration: 5200 });
      inputRef.current?.focus();
    }, [toast]),
  });

  /** Voice search: pause the music first (it stays paused — only the user's Play resumes it), then listen. */
  const startVoice = (current: string) => {
    if (playerRef.current.isPlaying) playerRef.current.pause();
    before.current = current;
    setHeard(false);
    setOpen(false);
    voice.start();
  };

  const toggleVoice = () => {
    // Car View: the big full-screen voice search (no keyboard popping up, results to tap or auto-play)
    if (compact && voice.supported) return openCarVoice();
    if (!voice.supported) {
      toast('Trình duyệt này không hỗ trợ tìm kiếm bằng giọng nói. Bạn hãy gõ để tìm nhé.', { type: 'warning' });
      inputRef.current?.focus();
      return;
    }
    if (voice.listening) return voice.stop();
    startVoice(value);
  };

  // "Tìm bài" on Now Playing: voice search when available, otherwise focus the box for typing
  const startVoiceRef = useRef(startVoice);
  startVoiceRef.current = startVoice;
  // leaving the page while listening (e.g. opening another screen) releases the microphone
  useEffect(() => () => voiceRef.current.voice.cancel(), [location.pathname]);
  const voiceRef = useRef({ voice, value });
  voiceRef.current = { voice, value };
  useEffect(() => {
    // "Tìm bài" opens TYPED search: focus the box, never the microphone and never pausing the music.
    // Voice search (which pauses the music first) only starts from the mic button, or `detail.voice`.
    const onFind = (e: Event) => {
      const { voice: v, value: cur } = voiceRef.current;
      if ((e as CustomEvent<{ voice?: boolean }>).detail?.voice && v.supported && !v.listening) startVoiceRef.current(cur);
      else {
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener('ambertube:find', onFind);
    return () => window.removeEventListener('ambertube:find', onFind);
  }, []);

  // "/" or Ctrl/Cmd+K focuses search
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '');
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (location.pathname === '/search' && !urlQuery && !compact) {
      quietFocus.current = true;
      inputRef.current?.focus();
    }
  }, [location.pathname, urlQuery, compact]);

  // click outside closes
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // keep the dropdown above the player and the on-screen keyboard
  useLayoutEffect(() => {
    if (!open) return;
    const fit = () => {
      const list = listRef.current;
      const input = rootRef.current;
      if (!list || !input) return;
      const vv = window.visualViewport;
      const viewportBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const player = document.querySelector('.player');
      const playerTop = player && getComputedStyle(player).display !== 'none' ? player.getBoundingClientRect().top : viewportBottom;
      // on-screen keyboard open → hide the compact player so results/suggestions get the room
      document.documentElement.classList.toggle('kb-open', !!vv && vv.height < window.innerHeight - 140);
      const bottom = Math.min(viewportBottom, playerTop) - 8;
      list.style.maxHeight = `${Math.max(120, bottom - input.getBoundingClientRect().bottom - 6)}px`;
    };
    fit();
    window.visualViewport?.addEventListener('resize', fit);
    window.addEventListener('resize', fit);
    return () => {
      window.visualViewport?.removeEventListener('resize', fit);
      window.removeEventListener('resize', fit);
      document.documentElement.classList.remove('kb-open');
    };
  }, [open, items.length]);

  const runSearch = (q: string) => {
    const text = q.trim();
    if (!text) return inputRef.current?.focus();
    setOpen(false);
    setHeard(false);
    setValue(text);
    const target = `/search?q=${encodeURIComponent(text)}`;
    if (location.pathname + location.search !== target) navigate(target); // no duplicate request for the same query
    inputRef.current?.blur();
  };

  const choose = (s: Suggestion) => {
    if (s.track && (s.kind === 'song' || s.kind === 'video' || s.kind === 'trending')) {
      setOpen(false);
      playTrack(s.track);
      inputRef.current?.blur();
      return;
    }
    runSearch(s.text);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (voice.listening) voice.stop();
    if (open && active >= 0 && items[active]) return choose(items[active]);
    runSearch(value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (voice.listening) voice.stop();
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setActive(-1);
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      if (!items.length) return;
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % items.length : i <= 0 ? items.length - 1 : i - 1));
    }
  };

  useEffect(() => {
    if (active < 0) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const showingRecent = !value.trim();
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const langLabel = settings.voiceLang === 'vi-VN' ? 'VI' : 'EN';

  return (
    <form ref={rootRef} className={`searchbar${voice.listening ? ' is-listening' : ''}${open ? ' is-open' : ''}`} onSubmit={submit} role="search">
      <input
        ref={inputRef}
        className="searchbar__input"
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setActive(-1); // Enter submits what was typed unless a suggestion was picked with the arrow keys
          setHeard(false);
          setOpen(true);
        }}
        onFocus={() => {
          if (quietFocus.current) quietFocus.current = false;
          else setOpen(true);
        }}
        onPointerDown={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={voice.listening ? (settings.voiceLang === 'vi-VN' ? 'Đang nghe… hãy nói tên bài hát' : 'Listening… say a song or artist') : compact ? 'Tìm bài hát, nghệ sĩ…' : 'Tìm nhạc, video, nghệ sĩ trên YouTube...'}
        aria-label="Tìm trên YouTube"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        enterKeyHint="search"
        spellCheck={false}
      />
      {heard && !voice.listening && <span className="searchbar__hint">Nhấn Enter để tìm</span>}
      {value && !voice.listening && (
        <button type="button" className="searchbar__clear" onClick={() => { setValue(''); setHeard(false); setOpen(true); inputRef.current?.focus(); }} aria-label="Xóa nội dung tìm kiếm">
          <X size={compact ? 20 : 16} />
        </button>
      )}
      {!compact && (
        <button type="button" className="searchbar__lang" onClick={() => updateSettings({ voiceLang: settings.voiceLang === 'vi-VN' ? 'en-US' : 'vi-VN' })}
          aria-label={`Ngôn ngữ giọng nói: ${settings.voiceLang === 'vi-VN' ? 'Tiếng Việt' : 'Tiếng Anh'}. Bấm để đổi.`} title="Ngôn ngữ tìm kiếm giọng nói" disabled={voice.listening}>
          {langLabel}
        </button>
      )}
      <button type="button" className={`searchbar__mic${voice.listening ? ' is-on' : ''}${voice.supported ? '' : ' is-unsupported'}`} onClick={toggleVoice} aria-pressed={voice.listening}
        aria-label={!voice.supported ? 'Trình duyệt không hỗ trợ tìm bằng giọng nói' : voice.listening ? 'Dừng nghe' : 'Tìm bằng giọng nói'}
        title={!voice.supported ? 'Trình duyệt không hỗ trợ tìm bằng giọng nói' : voice.listening ? 'Dừng nghe' : 'Tìm bằng giọng nói'}>
        {voice.supported ? <Mic size={compact ? 22 : 18} /> : <MicOff size={compact ? 22 : 18} />}
        {voice.listening && <span className="mic-rings" aria-hidden="true"><i /><i /></span>}
      </button>
      <button type="submit" className="searchbar__btn" aria-label="Tìm kiếm">
        <Search size={compact ? 22 : 20} strokeWidth={2} />
      </button>

      {open && !voice.listening && (
        <div className="suggest" ref={listRef}>
          {!showingRecent && (
            <button type="button" className="suggest__search" onPointerDown={(e) => e.preventDefault()} onClick={() => runSearch(value)}>
              <Search size={16} /> <span>Tìm “<strong>{value.trim()}</strong>”</span>
              {status === 'loading' ? <Loader2 size={15} className="spin suggest__spin" aria-label="Đang tải gợi ý" /> : <CornerDownLeft size={15} className="suggest__enter" />}
            </button>
          )}
          {showingRecent && history.length > 0 && <div className="suggest__head"><span>Tìm kiếm gần đây</span><button type="button" onPointerDown={(e) => e.preventDefault()} onClick={clearSearches} className="link-btn">Xóa lịch sử tìm kiếm</button></div>}
          <div role="listbox" id={listId} aria-label="Gợi ý tìm kiếm">
            {items.map((s, i) => {
              const meta = KIND[s.kind];
              const Icon = meta.icon;
              const isTrack = Boolean(s.track) && !compact;
              const firstTrending = s.kind === 'trending' && (i === 0 || items[i - 1].kind !== 'trending');
              return (
                <div key={s.id} role="presentation">
                  {firstTrending && <div className="suggest__head" role="presentation"><span>{trendingSource === 'youtube' ? 'Thịnh hành trên YouTube' : 'Phổ biến trong danh mục demo'}</span></div>}
                  <div
                    id={optionId(i)}
                    data-index={i}
                    role="option"
                    aria-selected={i === active}
                    className={`suggest__item suggest__item--${s.kind}${i === active ? ' is-active' : ''}`}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => choose(s)}
                  >
                    {isTrack ? <span className="suggest__thumb"><Artwork track={s.track} /></span> : <span className="suggest__icon"><Icon size={compact ? 20 : 17} /></span>}
                    <span className="suggest__text">
                      <span className="suggest__title"><Highlight text={s.text} query={value} /></span>
                      {!compact && s.sub && <span className="suggest__sub">{s.sub}</span>}
                    </span>
                    <span className="suggest__kind">{s.kind === 'trending' && trendingSource !== 'youtube' ? 'Phổ biến' : meta.label}</span>
                    {s.kind === 'recent' && (
                      <button type="button" className="suggest__remove" aria-label={`Xóa “${s.text}” khỏi lịch sử tìm kiếm`} title="Xóa khỏi lịch sử"
                        onPointerDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); removeSearch(s.text); }}>
                        <X size={compact ? 18 : 14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {status !== 'loading' && !showingRecent && items.length === 0 && <p className="suggest__empty">Không có gợi ý — nhấn Enter để tìm “{value.trim()}”.</p>}
          {showingRecent && items.length === 0 && status !== 'loading' && <p className="suggest__empty">Gõ tên bài hát, nghệ sĩ hoặc dán link YouTube.</p>}
          {status === 'error' && <p className="suggest__error"><AlertCircle size={14} /> Không tải được mục thịnh hành. Bạn vẫn có thể tìm bình thường.</p>}
        </div>
      )}
    </form>
  );
}
