import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceLang } from '../types';

export type VoiceError = 'not-allowed' | 'no-speech' | 'audio-capture' | 'network' | 'language-not-supported' | 'unknown';

export const VOICE_ERROR_MESSAGES: Record<VoiceError, string> = {
  'not-allowed': 'Quyền truy cập micro đang bị chặn. Hãy cho phép trong cài đặt trang web của trình duyệt, hoặc gõ để tìm.',
  'no-speech': 'Chưa nghe rõ. Hãy thử lại, hoặc gõ để tìm.',
  'audio-capture': 'Không tìm thấy micro. Hãy kiểm tra thiết bị, hoặc gõ để tìm.',
  network: 'Nhận dạng giọng nói cần kết nối Internet. Bạn vẫn có thể gõ để tìm.',
  'language-not-supported': 'Ngôn ngữ này chưa được hỗ trợ. Hãy thử ngôn ngữ còn lại.',
  unknown: 'Tìm kiếm giọng nói dừng đột ngột. Bạn có thể gõ để tìm.',
};

function mapError(code: string): VoiceError | null {
  if (code === 'aborted') return null;
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'not-allowed';
  if (code === 'no-speech' || code === 'audio-capture' || code === 'network' || code === 'language-not-supported') return code;
  return 'unknown';
}

export const getRecognitionCtor = (): VoiceRecognitionCtor | null =>
  typeof window === 'undefined' ? null : window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;

interface Options {
  lang: VoiceLang;
  /** interim + final text while listening */
  onTranscript(text: string, isFinal: boolean): void;
  onError(err: VoiceError): void;
}

/** Longest a single voice search may hold the microphone (Safari sometimes never fires `end`). */
const MAX_LISTEN_MS = 12_000;
/** After stop(): wait this long for the final result, then abort. */
const STOP_GRACE_MS = 1_500;

type AudioSessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record';
const audioSession = (): { type: AudioSessionType } | null =>
  (typeof navigator !== 'undefined' && (navigator as Navigator & { audioSession?: { type: AudioSessionType } }).audioSession) || null;

/**
 * After the microphone is released, iOS Safari can leave the page's audio session in
 * "play-and-record" (voice/telephony route, e.g. CarPlay stays in voice mode). Where the
 * standard Audio Session API exists (Safari 16.4+), tell the browser the page is a media
 * player again so iOS can return to the normal media route. No-op elsewhere.
 */
export function releaseMicAudioSession(): void {
  const s = audioSession();
  if (!s) return;
  try {
    s.type = 'playback';
    s.type = 'auto';
  } catch {
    /* not supported */
  }
}

/**
 * Thin wrapper around the Web Speech API. `supported` is false in browsers without it (e.g. Firefox).
 * Every exit path (result, error, cancel, permission denied, timeout, unmount) goes through one
 * idempotent `finish()`, so the microphone is always released and stale callbacks are ignored.
 */
export function useSpeechRecognition({ lang, onTranscript, onError }: Options) {
  const [listening, setListening] = useState(false);
  const rec = useRef<VoiceRecognition | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cb = useRef({ onTranscript, onError });
  cb.current = { onTranscript, onError };
  const supported = getRecognitionCtor() !== null;

  /** End the session for good: detach handlers, abort if still capturing, release the audio session. */
  const finish = useCallback((r: VoiceRecognition | null = rec.current) => {
    if (!r) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    r.onstart = r.onresult = r.onerror = r.onend = null;
    try {
      r.abort();
    } catch {
      /* already ended */
    }
    if (rec.current === r) {
      rec.current = null;
      setListening(false);
      releaseMicAudioSession();
    }
  }, []);

  /** Cancel immediately (user cancel, navigation, page hidden, unmount). */
  const cancel = useCallback(() => finish(), [finish]);

  /** Stop listening but keep what was said: give the engine a moment for the final result. */
  const stop = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    try {
      r.stop();
    } catch {
      /* ignore */
    }
    timers.current.push(setTimeout(() => finish(r), STOP_GRACE_MS));
  }, [finish]);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    finish(); // never two sessions at once
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    const current = () => rec.current === r; // ignore callbacks from an old session
    r.onstart = () => current() && setListening(true);
    r.onresult = (e) => {
      if (!current()) return;
      let text = '';
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      cb.current.onTranscript(text.trim(), final);
      if (final) finish(r); // got the query: release the mic right away
    };
    r.onerror = (e) => {
      if (!current()) return;
      const err = mapError(e.error);
      finish(r);
      if (err) cb.current.onError(err);
    };
    r.onend = () => finish(r);
    rec.current = r;
    timers.current.push(setTimeout(() => {
      if (!current()) return;
      finish(r);
      cb.current.onError('no-speech');
    }, MAX_LISTEN_MS));
    try {
      r.start();
    } catch {
      finish(r);
      cb.current.onError('unknown');
    }
  }, [lang, finish]);

  // unmount, or the page goes to the background / screen locks while listening: release the mic
  useEffect(() => {
    const onHidden = () => document.hidden && finish();
    const onPageHide = () => finish();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
      finish();
    };
  }, [finish]);

  return { supported, listening, start, stop, cancel };
}
