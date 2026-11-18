/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_YOUTUBE_API_KEY?: string;
  readonly VITE_CONVERSION_ENDPOINT?: string;
  readonly VITE_AUTHORIZED_CHANNEL_IDS?: string;
  readonly VITE_LYRICS_ENDPOINT?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
