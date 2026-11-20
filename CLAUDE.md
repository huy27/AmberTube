# AmberTube — maintainer notes (read this first)

Handoff notes for the next Claude (or developer) working on this repo. User-facing docs are in Vietnamese:
`README.md` (features), `DEPLOY.md` (Vercel), `SUPABASE.md` (accounts/sync/limits). This file covers the
context those don't: the rules the owner set, how things fit together, how to test, and what is still open.

## 1. What it is

AmberTube is a Vietnamese-language music web app (React 18 + TypeScript + Vite 5, static, deployed on Vercel at
https://amber-tube.vercel.app). Music comes from YouTube through a **hidden YouTube IFrame player** plus the YouTube
Data API. Other data sources:

- Last.fm: charts, popular artists and album art.
- Wikidata/Commons: artist photos.
- A bundled demo catalogue, used when there is no API key.

Optional Supabase accounts sync personal data across desktop, phone and the **VinFast VF5 car screen**. The car
screen uses a dedicated **Car View** and is reached through CarPlay / the APTV browser.

The owner writes in **Vietnamese**. Reply in Vietnamese, concisely. Keep all UI text in Vietnamese.

## 2. Rules the owner set (do not break)

### Secrets
- Never hardcode or commit keys. Everything comes from `VITE_*` env vars:
  - `VITE_YOUTUBE_API_KEY`
  - `VITE_LASTFM_API_KEY`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_LYRICS_ENDPOINT`, `VITE_CONVERSION_ENDPOINT`, `VITE_AUTHORIZED_CHANNEL_IDS`
- Supabase gets the **anon/publishable key only**. `src/services/supabase.ts` refuses `service_role`/`sb_secret_` keys.

### YouTube / playback
- The hidden player was explicitly allowed by the owner. The ToS risk is documented in the README.
- No silent-audio or keep-alive hacks.
- No extracting or proxying YouTube streams, no DRM bypass, no unofficial YouTube endpoints, no bypassing
  corporate firewalls.
- Video is shown only on desktop: a small window above the player bar, plus full screen.
- **Never show video in Car View** (driving safety).

### Honesty
- Never claim results from physical devices (iPhone, CarPlay, VF5) that were not actually tested. Say "chưa
  thử trên máy thật" (not yet tried on a real device).
- Voice search mic works in APTV on the real device (owner, 2026-11-20). Still unverified: audio routing after
  the mic (auto-resume after results) and iOS background audio.

### Car View (VF5)
- Screens: 800×480 and 1024×600 landscape; also any width ≤ 700 px or height ≤ 500 px (the `compact` layout).
- Touch targets ≥ 44 px.
- Performance mode via `html.mode-car`. Main-thread budget was tuned at 6× CPU throttle; do not regress it.

### Voice search
- Pause music before using the mic. Desktop: never auto-resume (the user resumes with Play). Car View (owner's
  request, 2026-11-20): once results are shown **and the mic is released**, the paused song continues until the user
  taps a result; on cancel/errors it stays paused and "Tiếp tục nhạc" resumes it. CarPlay routing of this resume is
  not yet tested on a real device.
- The mic must always be released.
- Never log transcripts (the diagnostics in `?diag=1` log events only).
- Keyboard search must never pause music.

### Autoplay
- There is **one switch**, "Tự động phát". Off = stop when the song ends (no next song, no recommendations, no
  skipping past errors).
- Source of truth: `RecommendationProvider` `prefs.enabled`. `Library settings.autoplay` mirrors it.
- Default is ON. The owner was asked whether to change this; no answer yet.

### Content rules
- Downloads/MP3 only for owned, CC or authorized-channel content.
- Lyrics only from the licensed endpoint or entered by the user. No scraping.
- **LRCLIB and Radio Browser are NOT implemented.** The owner deferred them. The DB `provider` column already
  allows `lastfm` and `radio-browser`.

### Style and process
- Keep the existing UI and architecture: dark charcoal with amber accent, tokens in `src/styles/theme.css`, font
  Be Vietnam Pro. Don't redesign unless asked.
- Before finishing any task: run tsc, unit tests, the relevant e2e suites, and the responsive audit; build.
  Just update the code: **do not package a zip** (the owner dropped that step, 2026-11-20).
- Run e2e against a key-less demo build. The local `.env` has real keys, and plain `npx vite build` uses them
  (tests would hit the real YouTube API and burn quota). Override them, e.g. `VITE_YOUTUBE_API_KEY=
  VITE_LASTFM_API_KEY= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite build --outDir <tmp>`.
- Report changed files, and give config steps in Vietnamese.

## 3. Commands

```bash
npm i
npm run dev                 # http://localhost:5173
npm run build               # tsc + vite build → dist/
npm test                    # 91 unit tests (node --experimental-strip-types)
npm run test:db             # 16 SQL tests on real Postgres (PGlite): RLS, triggers, limits
npm run test:e2e            # e2e/run.cjs: 6 core Playwright suites against the demo build on :4173
```

Pure modules that unit tests import must use **`.ts` extensions in their imports** and **no TS parameter
properties or enums**, because tests run through node strip-types. Examples: `src/sync/model.ts`, `engine.ts`,
`src/voice/rank.ts`, `src/charts/match.ts`.

## 4. Architecture map

**Provider order (`src/App.tsx`):**
Toast › **Auth** › DisplayMode › SearchHistory › Library › ListeningStore › Player › Recommendation › UI ›
Pomodoro › **Sync** › routes.

- `YouTubeHost` (the iframe) sits outside the routes, so it survives layout switches.
- `DiagPanel` is lazy and only mounts with `?diag=1`.

| Area | Where | Notes |
|---|---|---|
| Playback | `src/context/PlayerContext.tsx`, `src/playback/` (engines: youtube/htmlAudio/demo, queue, persistence, audioSession) | One YouTube player instance. Watchdog plus ENDED polling fallback. Media Session. `navigator.audioSession` handling for iOS/CarPlay |
| YouTube host / video | `src/components/YouTubeHost.tsx`, `src/hooks/useVideoAvailable.ts` | The iframe element is **never moved** (moving reloads it). Showing it or going full screen only changes CSS. The `.video-stage` div is the full-screen element |
| Search | `src/services/youtube.ts` (cache, inflight dedupe, `searchMusic` = category 10), `src/search/` | Search costs 100 quota units; `channels.list`/`videos.list` cost 1 |
| Recommendations | `src/recommend/` (`identity.ts` song identity/versions, `engine.ts`, `listening.ts`, providers) | Smart refill when the queue runs low |
| Last.fm | `src/services/lastfm.ts`, `src/charts/`, `src/artists/`, `src/lastfm/` | Country must be **"Viet Nam"** ("Vietnam" → error 6). Chart images are placeholders, so album art comes from `track.getInfo` (lazy, cached). Artist photos come from Wikidata/Commons (`artistImages.ts`), falling back to the YouTube channel avatar |
| Car View | `src/styles/car.css`, `CarPlayerBar`, `NowPlaying`, `CarNavDrawer`, `src/voice/CarVoiceSearch.tsx` | Voice: full-screen listening view, results ranked by `voice/rank.ts`, no auto-play (the user taps a result) |
| Focus mode | `src/focus/` (`/focus`) | Pomodoro. The timer and stats stay on the device |
| Accounts | `src/auth/AuthContext.tsx`, `AuthDialog`, `AccountButton`, `pages/AccountPage`, `pages/ResetPasswordPage` | supabase-js is **lazy-loaded**: guests never download it. Email/password and reset. Google button appears only if enabled in Supabase |
| Sync | `src/sync/` | See §5 |

## 5. Data, scopes and sync

**Local storage (localStorage only; no IndexedDB):**
- `ambertube:v1`: library (favorites, history, playlists, downloads, settings)
- `ambertube:search-history`
- `ambertube:listens:v1`: listening events/stats
- `ambertube:reco-feedback`
- `ambertube:smart-autoplay`
- `ambertube:focus:*`
- `ambertube:player`: queue, volume, position. Per device
- `ambertube:display-mode`: per device
- `ambertube:video`: per device
- Caches: search-cache, trending, lastfm-top, chart-match, track-art, artist-img

**Scopes (`src/sync/scope.ts`):**
- The guest uses the plain keys. Account *U* uses `key@u:<userId>`.
- `setScope()` makes the providers reload their data **without stopping playback**.
- Sign-out returns to guest data and deletes the account's local copy, because the VF5 screen is shared.
- An expired session keeps the user's data visible and queued until they sign in again.

**Sync engine (`src/sync/engine.ts`, pure, with tests in `sync.test.ts`):**
- Local-first. Each record has a stable id `<table>|<key>` and a content hash. `base` holds the last agreed
  hash/time; `pending` holds local edits with their time.
- **Round:** `scan` → `pull` (cursor on `updated_at` minus 60 s overlap) → `scan(force)` → `push`.
- **Conflicts:** newest `changed_at` wins. The server trigger ignores stale writes.
- **Deletes:** tombstones (`deleted=true`).
- **Local caps** (200 recent, 25 searches, 1,500 listens / 120 days) are "trimmed", never deleted in the cloud.
- **New device:** a device's default settings never override the account's. The first sync pulls before it
  scans.
- **Applying server changes:** `port.write(d, changes)` applies changes to the **current** provider state
  (functional updates). This prevents an edit made during a pull from being overwritten.
- **Account limit refusal** (`AMBERTUBE_LIMIT`): the item stays local, the user is told, it is not retried until
  room is made.
- **Triggers** (`SyncProvider.tsx`): sign-in, local change (1.5 s debounce), Realtime, `online`/`visibilitychange`,
  and a 90 s poll when Realtime is down. Retry back-off 5 s → 2 min.
- **Guest → account merge** (`mergeGuestInto`): offered once (Gộp / Không / Để sau). Never overwrites, dedupes,
  merges playlists with the same name, respects limits.
- **Synced:** favorites, playlists + tracks, recently played, listening stats, search history, settings
  (`lib.*`, `reco.prefs`, `reco.feedback`, `focus.settings`).
- **Device-only:** queue, volume, display mode, timers, downloads, caches.

## 6. Supabase

Files:
- `supabase/migrations/0001_init.sql`: 7 tables, RLS, triggers, Realtime publication.
- `supabase/migrations/0002_limits.sql`: plan-B per-user limits, rolling trims, `ambertube_my_usage()`, a daily
  `pg_cron` job `ambertube-cleanup`.
- Paste-safe copies (no indentation, no comments): `supabase/ambertube_supabase_setup.sql` and `…_limits.sql`.

**Gotcha:** copying SQL from a chat or file preview turned leading spaces into NBSP. Postgres then threw
`syntax error` at indented lines. Have the owner download the file and copy it from an editor, or use the
paste-safe copies.

**Plan-B limits per user (~10 MB max, ~1.7 MB typical):**
- Refused when exceeded: 5,000 favorites; 200 playlists; 1,000 songs per playlist and 5,000 in total.
- Rolling (oldest rows removed automatically): 500 recent, 2,000 listens / 180 days, 100 searches.
- Tombstones are purged after 90 days.

The app pre-checks the refused limits (`src/sync/limits.ts`) and shows usage on `/account`.

**Owner's project (as of 2026-11):**
- Ref `wagqglmenmywvzfcjuqq`; the URL is in Vercel env.
- Both migrations were run successfully. The trigger on `auth.users` works.
- Email provider ON, "Confirm email" OFF, Google OFF.
- Whether `pg_cron` is enabled and whether 0002 was run: **not confirmed**. Ask.
- 15/15 live backend checks passed (RLS isolation, Realtime, stale-write, tombstones), run from the owner's
  browser with test accounts. Two test users may still exist:
  `ambertube.test.a.mwohkf8a@gmail.com` and `ambertube.test.b.mwohkf8a@gmail.com`.

**Local stand-in for e2e:** `node e2e/fake-supabase.mjs 54321`.
- GoTrue-style auth plus a PostgREST subset on PGlite, running the real migrations.
- No Realtime.
- Test hooks: `/__test/reset`, `/__test/expire`, `/__test/fail`, `/__test/rows/<table>`, `/__test/recovery`,
  `/__test/log`.

## 7. Testing

Builds and preview ports. Preview servers die often; restart them with `setsid nohup … &`.

| Build | Command | Port | Used by |
|---|---|---|---|
| demo (no keys) | `npx vite build && npx vite preview --port 4173` | 4173 | `run.cjs` suites, voice-*, car-voice, responsive-audit, perf-memory-nav |
| API (mocked YouTube + Last.fm) | `VITE_YOUTUBE_API_KEY=TEST_KEY VITE_LASTFM_API_KEY=TEST npx vite build --outDir /tmp/dist-api && npx vite preview --outDir /tmp/dist-api --port 4174` | 4174 | api-mode-autoplay, autoplay-advance, slow-network, lifecycle-media-session, popular-artists, popular-charts, video-toggle, perf-car-profile, perf-web-vitals |
| sync | `VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=sb_publishable_test_key_for_fake_server_123 VITE_YOUTUBE_API_KEY=TEST_KEY npx vite build --outDir /tmp/dist-sync && npx vite preview --outDir /tmp/dist-sync --port 4175` + fake server on 54321 | 4175 | auth-sync (reset the fake server before each run) |

Patterns used in the tests:
- **Fake YouTube:** `window.YT.Player` is replaced via `addInitScript`; `loadVideoById` sets `window.__loaded`.
  The YouTube Data API, Last.fm, Wikidata and Commons are mocked with `ctx.route`.
- **Fake speech:** `window.SpeechRecognition` class with `say(text, final)` and `fail(code)` helpers.
- The sandbox **cannot reach** YouTube, Last.fm or Supabase directly (proxy 403). Real-service checks were done
  through the built-in browser on the owner's machine (`javascript_tool` on amber-tube.vercel.app).

Known flakiness: `focus-mode` under CPU load (passes on rerun).

Benchmarks to keep (heavy user, 4× CPU, slow 3G):
- Desktop: FCP ≈ 1.7–1.8 s, TBT ≈ 300 ms, INP ≈ 180–190 ms, CLS ≈ 0.
- Car profile at 6× CPU: 0 long tasks around track switches.
- Main bundle ≈ 137 KB gzip. Supabase, the sync engine and pages are separate lazy chunks.

## 8. Open items / waiting on the owner

1. **APTV (CarPlay browser) mic: resolved.** On 2026-11-20 the owner reported that the mic works in APTV on the
   real device. The old "không hỗ trợ" options (reload, player re-create, hide mic, contact APTV) are dropped. The
   typed-search fallback stays for browsers without speech recognition. Still unverified on the real device: the
   new auto-resume of the paused song after voice results (audio routing back from the mic).
2. **Repo hygiene, offered and not chosen:** git + CI, ESLint, dependency upgrades / `npm audit`.
3. **More sync, suggested and not chosen:**
   - "continue on another device" (resume banner, never auto-overwrite);
   - user-entered lyrics;
   - focus stats and ambient prefs;
   - preferred playback speed.
4. **Default "Tự động phát":** ON or OFF for new users?
5. **Deploy steps the owner must do:** Vercel env vars plus redeploy; enable `pg_cron`; run `0002_limits.sql`;
   delete the test users.
6. **Unresolved investigation:** YouTube playback blocked on the Vercel origin but fine on localhost on the owner's
   corporate network. Root cause not established; HAR/console evidence was requested. Do not "fix" it with
   workarounds.
7. **Known limits:**
   - A device offline for more than 90 days may keep items deleted elsewhere (tombstones purged).
   - Realtime is not covered by the fake server.
   - Last.fm Vietnam data is thin (low listener counts, placeholder images).

## 9. Gotchas

- Moving the YouTube iframe in the DOM reloads it and stops the music. Change CSS only.
- Effects run child-first. Providers reload scope data in their own effects, so the Sync engine waits until
  `lib.scope` matches (`ready()`) before reading local data. Otherwise guest data would be pushed into the
  account.
- In Car View, `.np` (Now Playing) covers the search bar. Close it before clicking the search box in tests.
- Several elements can share a label (the queue panel's autoplay switch is hidden). Scope selectors, for example
  `.main__scroll button[role="switch"]`.
- Headless Playwright cannot exit native fullscreen with Esc. `YouTubeHost` handles Esc itself too.
- `vi-VN` number formatting renders 5000 as `5.000` in messages and tests.
- Last.fm error codes:
  - 6 = invalid param / track not found: no retry.
  - 29 = rate limit: no retry.
  - 10/26/4 = auth.
  - Network or server errors are retried once.
