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

/** Thin wrapper around the Web Speech API. `supported` is false in browsers without it (e.g. Firefox). */
export function useSpeechRecognition({ lang, onTranscript, onError }: Options) {
  const [listening, setListening] = useState(false);
  const rec = useRef<VoiceRecognition | null>(null);
  const cb = useRef({ onTranscript, onError });
  cb.current = { onTranscript, onError };
  const supported = getRecognitionCtor() !== null;

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    rec.current?.abort();
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onstart = () => setListening(true);
    r.onresult = (e) => {
      let text = '';
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      cb.current.onTranscript(text.trim(), final);
    };
    r.onerror = (e) => {
      const err = mapError(e.error);
      if (err) cb.current.onError(err);
    };
    r.onend = () => {
      setListening(false);
      if (rec.current === r) rec.current = null;
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      setListening(false);
      cb.current.onError('unknown');
    }
  }, [lang]);

  useEffect(() => () => rec.current?.abort(), []);

  return { supported, listening, start, stop };
}
