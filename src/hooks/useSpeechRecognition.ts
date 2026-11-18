import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceLang } from '../types';
import { markMicActive, setAudioSessionType } from '../playback/audioSession';
import { diag } from '../diag/audioDiag';

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

/** After the microphone is released: hand the page back to media playback (see playback/audioSession.ts). */
export function releaseMicAudioSession(): void {
  setAudioSessionType('playback', 'microphone released');
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
  const finish = useCallback((r: VoiceRecognition | null = rec.current, why = 'cleanup') => {
    if (!r) return;
    if (rec.current === r) diag('voice.finish', { why });
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
      markMicActive(false);
      releaseMicAudioSession();
    }
  }, []);

  /** Cancel immediately (user cancel, navigation, page hidden, unmount). */
  const cancel = useCallback(() => finish(rec.current, 'cancel'), [finish]);

  /** Stop listening but keep what was said: give the engine a moment for the final result. */
  const stop = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    diag('voice.stop');
    try {
      r.stop();
    } catch {
      /* ignore */
    }
    timers.current.push(setTimeout(() => finish(r, 'stop grace elapsed'), STOP_GRACE_MS));
  }, [finish]);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    finish(rec.current, 'new session'); // never two sessions at once
    // the page is about to capture the microphone: say so explicitly (released → "playback" afterwards)
    markMicActive(true);
    setAudioSessionType('play-and-record', 'voice search starting');
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    const current = () => rec.current === r; // ignore callbacks from an old session
    r.onstart = () => {
      if (!current()) return;
      diag('voice.onstart');
      setListening(true);
    };
    r.onresult = (e) => {
      if (!current()) return;
      let text = '';
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      cb.current.onTranscript(text.trim(), final);
      if (final) {
        diag('voice.result', { final: true, chars: text.trim().length }); // never the transcript itself
        finish(r, 'final result'); // got the query: release the mic right away
      }
    };
    r.onerror = (e) => {
      if (!current()) return;
      const err = mapError(e.error);
      diag('voice.error', { code: e.error });
      finish(r, 'error');
      if (err) cb.current.onError(err);
    };
    r.onend = () => {
      diag('voice.onend');
      finish(r, 'engine ended');
    };
    rec.current = r;
    timers.current.push(setTimeout(() => {
      if (!current()) return;
      finish(r, 'timeout');
      cb.current.onError('no-speech');
    }, MAX_LISTEN_MS));
    diag('voice.start', { lang });
    try {
      r.start();
    } catch (e) {
      diag('voice.startFailed', { error: String(e) });
      finish(r, 'start threw');
      cb.current.onError('unknown');
    }
  }, [lang, finish]);

  // unmount, or the page goes to the background / screen locks while listening: release the mic
  useEffect(() => {
    const onHidden = () => document.hidden && finish(rec.current, 'page hidden');
    const onPageHide = () => finish(rec.current, 'pagehide');
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
      finish(rec.current, 'unmount');
    };
  }, [finish]);

  return { supported, listening, start, stop, cancel };
}
