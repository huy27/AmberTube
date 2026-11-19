/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_YOUTUBE_API_KEY?: string;
  readonly VITE_CONVERSION_ENDPOINT?: string;
  readonly VITE_AUTHORIZED_CHANNEL_IDS?: string;
  readonly VITE_LYRICS_ENDPOINT?: string;
  readonly VITE_LASTFM_API_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  /** the anon / publishable key only — never the service_role / secret key */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
