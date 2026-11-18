// Minimal typings for the Web Speech API recognition interface (not in TypeScript's DOM lib).
interface VoiceAlternative { readonly transcript: string; readonly confidence: number }
interface VoiceResult { readonly isFinal: boolean; readonly length: number; readonly [index: number]: VoiceAlternative }
interface VoiceResultList { readonly length: number; readonly [index: number]: VoiceResult }
interface VoiceResultEvent extends Event { readonly resultIndex: number; readonly results: VoiceResultList }
interface VoiceErrorEvent extends Event { readonly error: string; readonly message: string }

interface VoiceRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: VoiceResultEvent) => void) | null;
  onerror: ((e: VoiceErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type VoiceRecognitionCtor = new () => VoiceRecognition;

interface Window {
  SpeechRecognition?: VoiceRecognitionCtor;
  webkitSpeechRecognition?: VoiceRecognitionCtor;
  webkitAudioContext?: typeof AudioContext;
}
