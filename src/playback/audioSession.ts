// The page's audio session type (W3C Audio Session API, WebKit/Safari 16.4+; no-op elsewhere).
//
// WebKit picks the iOS AVAudioSession category for the page automatically ("auto"). While the
// microphone is captured it switches to play-and-record (voice route: on CarPlay / iPhone this can mean
// the phone speaker or the car's call channel). When media starts playing while that category is still
// active, WebKit keeps play-and-record — so music resumed after Voice Search can stay on the voice
// route until the page is reloaded (a reload starts a fresh page with no capture history).
// Declaring the page's intent explicitly fixes that without a reload:
//   before listening → "play-and-record";  after the microphone is released → "playback" (and it stays).
import { diag } from '../diag/audioDiag';

type AudioSessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record';
interface AudioSessionLike { type: AudioSessionType; state?: string; addEventListener?: (t: string, f: () => void) => void }

export const audioSession = (): AudioSessionLike | null =>
  (typeof navigator !== 'undefined' && (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession) || null;

let micActive = false;
/** Set by voice search while the microphone is (being) captured. */
export function markMicActive(active: boolean): void {
  micActive = active;
  diag(active ? 'mic.active' : 'mic.released');
}

/** Explicit Play: media playback is what the page does (unless the microphone is in use right now). */
export function ensurePlaybackSession(why: string): void {
  if (!micActive) setAudioSessionType('playback', why);
}

export function setAudioSessionType(type: AudioSessionType, why: string): void {
  const s = audioSession();
  if (!s) {
    diag('audioSession.unsupported', { wanted: type, why });
    return;
  }
  if (s.type === type) return;
  try {
    const from = s.type;
    s.type = type;
    diag('audioSession.type', { from, to: s.type, why });
  } catch (e) {
    diag('audioSession.error', { wanted: type, error: String(e) });
  }
}

// diagnostics: report what the browser says about the session
const s0 = audioSession();
s0?.addEventListener?.('statechange', () => diag('audioSession.state', { state: s0.state, type: s0.type }));
