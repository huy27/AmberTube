// Accounts + cross-device sync, end to end: two browser contexts = two devices, against a local Supabase
// stand-in (e2e/fake-supabase.mjs: real Postgres + the real migration/RLS). YouTube is mocked.
//
//   node e2e/fake-supabase.mjs 54321 &
//   VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=sb_publishable_test_key_for_fake_server_123 \
//     VITE_YOUTUBE_API_KEY=TEST_KEY npx vite build --outDir /tmp/dist-sync
//   npx vite preview --outDir /tmp/dist-sync --port 4175 &
//   node e2e/auth-sync.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const URL0 = process.env.AMBERTUBE_SYNC_URL || 'http://localhost:4175';
const SB = process.env.FAKE_SUPABASE || 'http://localhost:54321';
const vids = [
  ['v1aaaaaaaaa', 'Đen Vâu - Lối Nhỏ', 'Đen Vâu Official', 270],
  ['v2aaaaaaaaa', 'Đen Vâu - Bài Này Chill Phết', 'Đen Vâu Official', 280],
  ['v3aaaaaaaaa', 'Đen Vâu - Mang Tiền Về Cho Mẹ', 'Đen Vâu Official', 400],
  ['v4aaaaaaaaa', 'Vũ. - Lạ Lùng', 'Vũ.', 260],
  ['v5aaaaaaaaa', 'Chillies - Mascara', 'Chillies', 230],
];
const resource = ([id, title, ch, dur]) => ({ id, snippet: { title, channelTitle: ch, channelId: 'UC' + ch.length, liveBroadcastContent: 'none', thumbnails: {}, categoryId: '10' }, contentDetails: { duration: `PT${Math.floor(dur / 60)}M${dur % 60}S` }, statistics: { viewCount: '100000' }, status: { license: 'youtube' } });
const hook = (p, body) => fetch(SB + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const rows = (t) => hook(`/__test/rows/${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000, step = 150) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch { /* retry */ }
    await sleep(step);
  }
  return last;
}

(async () => {
  await hook('/__test/reset', {});
  const b = await chromium.launch();
  let fails = 0;
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fails++; };

  async function device(name, { viewport = { width: 1360, height: 860 }, mode = 'desktop' } = {}) {
    const ctx = await b.newContext({ viewport, hasTouch: viewport.width < 1024 });
    const sb = [];
    ctx.on('request', (r) => { if (r.url().startsWith(SB)) sb.push(r.url()); });
    await ctx.route('https://www.googleapis.com/youtube/v3/**', (route) => {
      const u = new URL(route.request().url());
      if (u.pathname.endsWith('/search')) return route.fulfill({ json: { items: vids.map(([id]) => ({ id: { videoId: id } })) } });
      if (u.searchParams.get('chart')) return route.fulfill({ json: { items: [] } });
      const ids = (u.searchParams.get('id') || '').split(',');
      return route.fulfill({ json: { items: vids.filter(([id]) => ids.includes(id)).map(resource) } });
    });
    await ctx.route('https://i.ytimg.com/**', (r) => r.abort());
    await ctx.addInitScript((m) => {
      if (!sessionStorage.getItem('i')) { localStorage.clear(); localStorage.setItem('ambertube:display-mode', m); localStorage.setItem('ambertube:car-suggest-dismissed', '1'); sessionStorage.setItem('i', '1'); }
      class Player { constructor(el, o) { window.__players = (window.__players || 0) + 1; this.o = o; setTimeout(() => o.events.onReady({ target: this }), 10); }
        _s(s) { this.state = s; this.o.events.onStateChange({ target: this, data: s }); }
        loadVideoById({ videoId }) { this.vid = videoId; window.__loaded = videoId; setTimeout(() => { this.since = performance.now(); this._s(1); }, 20); }
        cueVideoById() { this._s(5); } playVideo() { this._s(1); } pauseVideo() { this._s(2); } stopVideo() {} seekTo() {}
        getCurrentTime() { return this.since ? (performance.now() - this.since) / 1000 : 0; } getDuration() { return 270; } getPlayerState() { return this.state ?? -1; }
        setVolume() {} mute() {} unMute() {} setPlaybackRate() {} getPlaybackRate() { return 1; } getAvailablePlaybackRates() { return [1]; } getVideoData() { return {}; } }
      window.YT = { Player };
    }, mode);
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    return { name, ctx, p, sb, errs };
  }
  const playing = (d) => d.p.evaluate(() => Boolean(document.querySelector('button[aria-label="Tạm dừng"]')));
  const status = (d) => d.p.$eval('.account__btn', (e) => [...e.classList].find((c) => c.startsWith('account__btn--'))?.slice(14)).catch(() => null);
  const pull = (d) => d.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const lsKeys = (d) => d.p.evaluate(() => Object.keys(localStorage));
  const savedTitles = (d) => d.p.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('ambertube:v1')) && (localStorage.getItem('ambertube:active-scope') ? `ambertube:v1@${localStorage.getItem('ambertube:active-scope')}` : 'ambertube:v1'); return (JSON.parse(localStorage.getItem(k) || '{}').saved || []).map((t) => t.title); });
  async function playAndLike(d, i) {
    await d.p.goto(URL0 + '/search?q=den');
    await d.p.waitForSelector('.video-row');
    await d.p.click(`.video-row >> nth=${i}`);
    await d.p.waitForFunction(() => window.__loaded);
    await d.p.waitForTimeout(300);
    await d.p.click('.player__like');
  }
  async function openDialog(d) {
    await d.p.click('.account__login, .account__login-icon');
    await d.p.waitForSelector('.auth-dialog');
  }
  async function register(d, email, pw = 'password123', name = '') {
    await openDialog(d);
    await d.p.click('.auth-links button:has-text("Đăng ký")');
    await d.p.waitForSelector('input[autocomplete="name"]');
    await d.p.waitForTimeout(100);
    if (name) await d.p.fill('input[autocomplete="name"]', name);
    await d.p.fill('input[type="email"]', email);
    await d.p.fill('input[type="password"]', pw);
    if (process.env.DBG) console.log('vals', await d.p.$$eval('.auth-form input', (xs) => xs.map((x) => x.type + '=' + x.value)), await d.p.$$eval('input[type="email"]', (xs) => xs.length));
    await d.p.click('.auth-submit');
  }
  async function login(d, email, pw = 'password123') {
    if (!(await d.p.$('.auth-dialog'))) await openDialog(d);
    await d.p.fill('input[type="email"]', email);
    await d.p.fill('input[type="password"]', pw);
    await d.p.click('.auth-submit');
  }

  // ---------- 1. guest ----------
  const A = await device('A');
  await A.p.goto(URL0 + '/');
  await A.p.waitForSelector('.account--guest');
  check('guest: "Khách" + "Đăng nhập" shown', (await A.p.isVisible('.guest-chip')) && (await A.p.isVisible('.account__login')));
  await playAndLike(A, 0); // a guest favorite on device A
  await A.p.waitForTimeout(400);
  check('guest: search, playback and favorites work without an account', await playing(A) && (await savedTitles(A)).includes('Đen Vâu - Lối Nhỏ'));
  const chunks = await A.p.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /assets\/.*\.js$/.test(n)));
  check('guest: no Supabase requests and the Supabase library is not downloaded', A.sb.length === 0 && !chunks.some((c) => /\/dist-[\w-]+\.js$/.test(c) || /engine-|supabaseRemote/.test(c)), `${A.sb.length} requests`);

  // ---------- 2. register on A → migration offer → merge ----------
  await register(A, 'an@test.dev', 'password123', 'An');
  await A.p.waitForSelector('.account__btn', { timeout: 8000 }).catch(async (e) => {
    console.log('dialog:', await A.p.$eval('.auth-dialog', (x) => x.innerText).catch(() => 'none'), await hook('/__test/log'));
    throw e;
  });
  check('register: signed in straight away (auto-confirm project), avatar shown', (await A.p.isVisible('.account__btn')) && !(await A.p.isVisible('.account--guest')));
  await A.p.waitForSelector('#merge-title', { timeout: 8000 }).catch(() => {});
  check('guest data detected → merge offered with counts', /1 bài yêu thích/.test(await A.p.textContent('.auth-dialog').catch(() => '')));
  check('music kept playing through sign-in', await playing(A) && (await A.p.evaluate(() => window.__players)) === 1);
  await A.p.click('button:has-text("Gộp vào tài khoản")');
  const favRows = await until(async () => (await rows('favorites')).filter((r) => !r.deleted).length === 1 && rows('favorites'));
  check('merge: the guest favorite is now in the account (provider + videoId + metadata)', Array.isArray(favRows) && favRows[0]?.provider === 'youtube' && favRows[0]?.track_id === 'v1aaaaaaaaa' && favRows[0]?.track?.title === 'Đen Vâu - Lối Nhỏ', JSON.stringify(favRows?.[0] ?? null).slice(0, 160));
  check('merge: guest copy preserved on the device', await A.p.evaluate(() => (JSON.parse(localStorage.getItem('ambertube:v1') || '{}').saved || []).length === 1));
  await until(async () => (await status(A)) === 'synced');
  check('sync indicator: synced', (await status(A)) === 'synced');
  // more data on A: a second favorite, a playlist with a song, a search, a setting
  await playAndLike(A, 2);
  await A.p.goto(URL0 + '/playlists');
  await A.p.click('button:has-text("Playlist mới")');
  await A.p.fill('.inline-form input', 'Đi xe VF5');
  await A.p.click('.inline-form button[type="submit"]');
  await A.p.goto(URL0 + '/search?q=den'); await A.p.waitForSelector('.video-row');
  await A.p.click('button[aria-label="Tùy chọn khác cho Vũ. - Lạ Lùng"]');
  await A.p.click('.menu button:has-text("Thêm vào playlist")');
  await A.p.click('.menu button:has-text("Đi xe VF5")');
  await A.p.goto(URL0 + '/settings');
  await A.p.selectOption('select[aria-label="Kiểu hiệu ứng"]', 'spectrum');
  await until(async () => (await rows('playlist_tracks')).length === 1 && (await rows('favorites')).length === 2 && (await rows('user_settings'))[0]?.data?.['lib.visualizer']?.v === 'spectrum', 10000);
  const pt = await rows('playlist_tracks');
  await A.p.goto(URL0 + '/account');
  const usageTxt = await until(async () => { const t = await A.p.textContent('.account-usage').catch(() => ''); return /Yêu thích\s*2 \/ 5\.000/.test(t) && t; }, 8000);
  check('account page: usage vs limits (Yêu thích 2 / 5.000, MB used)', Boolean(usageTxt) && /MB/.test(usageTxt), String(usageTxt).slice(0, 120));
  check('A: playlist + its song, second favorite, search and setting reach the account', pt.length === 1 && pt[0].track_id === 'v4aaaaaaaaa' && (await rows('search_history')).length >= 1 && (await rows('user_settings'))[0]?.data?.['lib.visualizer']?.v === 'spectrum');

  // ---------- 3. device B logs in → everything appears ----------
  const B = await device('B', { viewport: { width: 390, height: 844 } });
  await B.p.goto(URL0 + '/library');
  await B.p.waitForSelector('.account__login-icon, .account__login');
  await B.p.click('.account__login, .account__login-icon');
  await B.p.waitForSelector('.auth-dialog');
  await login(B, 'an@test.dev');
  await B.p.waitForSelector('.account__btn', { timeout: 8000 });
  await until(async () => (await savedTitles(B)).length === 2, 8000);
  check('B (phone): favorites from A appear after login', JSON.stringify((await savedTitles(B)).sort()) === JSON.stringify(['Đen Vâu - Lối Nhỏ', 'Đen Vâu - Mang Tiền Về Cho Mẹ']), (await savedTitles(B)).join(' | '));
  check('B: no merge prompt (B had no guest data)', !(await B.p.$('#merge-title')));
  await B.p.goto(URL0 + '/playlists');
  await B.p.waitForSelector('.card-grid');
  check('B: playlist with its song', /Đi xe VF5/.test(await B.p.textContent('.card-grid')));
  check('B: settings restored (visualizer)', await B.p.evaluate(() => JSON.parse(localStorage.getItem(`ambertube:v1@${localStorage.getItem('ambertube:active-scope')}`)).settings.visualizer === 'spectrum'));
  check('B: search history restored', await B.p.evaluate(() => (JSON.parse(localStorage.getItem(`ambertube:search-history@${localStorage.getItem('ambertube:active-scope')}`) || '[]')).some((h) => h.q === 'den')));
  // B plays the synced favorite: same YouTube video id through the existing player
  await B.p.goto(URL0 + '/library'); await B.p.waitForSelector('.video-row');
  await B.p.click('.video-row >> nth=0'); await B.p.waitForFunction(() => window.__loaded);
  check('B: a synced favorite plays through the existing YouTube player', ['v1aaaaaaaaa', 'v3aaaaaaaaa'].includes(await B.p.evaluate(() => window.__loaded)));

  // ---------- 4. changes flow both ways ----------
  await B.p.click('button[aria-label^="Tùy chọn khác cho Đen Vâu - Mang Tiền"]');
  await B.p.click('.menu button:has-text("Bỏ yêu thích")');
  await until(async () => (await rows('favorites')).some((r) => r.track_id === 'v3aaaaaaaaa' && r.deleted));
  await pull(A);
  await until(async () => (await savedTitles(A)).length === 1, 6000);
  check('unfavorite on B → removed on A', JSON.stringify(await savedTitles(A)) === JSON.stringify(['Đen Vâu - Lối Nhỏ']), (await savedTitles(A)).join(' | '));

  // ---------- 5. offline + failed sync on B ----------
  await B.p.goto(URL0 + '/search?q=den'); await B.p.waitForSelector('.video-row');
  await B.p.click('.video-row >> nth=1'); await B.p.waitForTimeout(500);
  await B.ctx.setOffline(true);
  await B.p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await B.p.click('button[aria-label="Tùy chọn khác cho Chillies - Mascara"]');
  await B.p.click('.menu button:has-text("Thêm vào yêu thích")');
  const offline = await until(async () => ['offline', 'error'].includes(await status(B)) && status(B), 9000);
  check('offline: change kept locally, indicator shows offline', offline === 'offline' && (await savedTitles(B)).includes('Chillies - Mascara'), String(offline));
  check('offline: music keeps playing', await playing(B));
  await hook('/__test/fail', { count: 1 }); // the first request after reconnecting fails too
  await B.ctx.setOffline(false);
  await B.p.evaluate(() => window.dispatchEvent(new Event('online')));
  const back = await until(async () => (await rows('favorites')).some((r) => r.track_id === 'v5aaaaaaaaa' && !r.deleted), 25000, 400);
  check('back online (+ one server error): retried and synced', Boolean(back));
  await until(async () => (await status(B)) === 'synced', 8000);
  check('indicator back to synced', (await status(B)) === 'synced');

  // ---------- 6. data isolation ----------
  const C = await device('C');
  await C.p.goto(URL0 + '/');
  await register(C, 'binh@test.dev');
  await C.p.waitForSelector('.account__btn', { timeout: 8000 });
  await C.p.waitForTimeout(2500);
  check('another account sees none of the first account\'s data', (await savedTitles(C)).length === 0);
  const tokC = await C.p.evaluate(() => JSON.parse(localStorage.getItem('ambertube-auth')).access_token);
  const anUser = (await rows('favorites'))[0].user_id;
  const peek = await fetch(`${SB}/rest/v1/favorites?select=*&user_id=eq.${anUser}`, { headers: { apikey: 'x', authorization: `Bearer ${tokC}` } }).then((r) => r.json());
  const write = await fetch(`${SB}/rest/v1/favorites`, { method: 'POST', headers: { apikey: 'x', authorization: `Bearer ${tokC}`, 'content-type': 'application/json' }, body: JSON.stringify([{ user_id: anUser, provider: 'youtube', track_id: 'evilevilevi', track: {} }]) });
  const anon = await fetch(`${SB}/rest/v1/favorites?select=*`, { headers: { apikey: 'x' } });
  check('RLS via the API: other user reads 0 rows, cannot write into them, anon is refused', Array.isArray(peek) && peek.length === 0 && write.status === 403 && anon.status >= 401, `${peek.length} / ${write.status} / ${anon.status}`);
  await C.ctx.close();

  // ---------- 7. logout on A (shared screen) → guest again, account copy removed ----------
  await A.p.goto(URL0 + '/search?q=den'); await A.p.waitForSelector('.video-row');
  await A.p.click('.video-row >> nth=3'); await A.p.waitForTimeout(500);
  await A.p.click('.account__btn');
  await A.p.click('.account__menu button:has-text("Đăng xuất")');
  await A.p.waitForSelector('.account--guest', { timeout: 8000 });
  await A.p.waitForTimeout(1500);
  const keys = await lsKeys(A);
  check('logout: back to guest mode; no account data left on the device', !keys.some((k) => k.includes('@u:')) && !keys.includes('ambertube-auth') && !keys.includes('ambertube:active-scope'), keys.filter((k) => k.includes('@u:')).join(','));
  check('logout: guest library is the guest\'s own (1 favorite from before sign-in)', JSON.stringify(await savedTitles(A)) === JSON.stringify(['Đen Vâu - Lối Nhỏ']));
  check('logout: playback not interrupted', await playing(A));
  // ---------- 8. login again on A → restored, no second merge prompt ----------
  await openDialog(A);
  await login(A, 'an@test.dev', 'wrong-password');
  await A.p.waitForSelector('.auth-msg--error');
  check('wrong password → clear message', /không đúng/.test(await A.p.textContent('.auth-msg--error')));
  await login(A, 'an@test.dev');
  await A.p.waitForSelector('.account__btn', { timeout: 8000 });
  await until(async () => (await savedTitles(A)).length === 2, 8000);
  check('login again: account data restored from the cloud (incl. B\'s offline favorite)', (await savedTitles(A)).includes('Chillies - Mascara'), (await savedTitles(A)).join(' | '));
  await A.p.waitForTimeout(800);
  check('no second merge prompt after "Gộp"', !(await A.p.$('#merge-title')));
  check('session survives a page reload', await (async () => { await A.p.reload(); await A.p.waitForSelector('.account__btn', { timeout: 8000 }); return !(await A.p.$('.account--guest')); })());

  // ---------- 9. expired session: changes kept, re-login resumes ----------
  await hook('/__test/expire', { email: 'an@test.dev' });
  await A.p.goto(URL0 + '/search?q=den'); await A.p.waitForSelector('.video-row');
  await A.p.click('button[aria-label="Tùy chọn khác cho Đen Vâu - Bài Này Chill Phết"]');
  await A.p.click('.menu button:has-text("Thêm vào yêu thích")');
  const exp = await until(async () => (await status(A)) === 'expired', 10000);
  if (!exp) console.log('status now', await status(A), await A.p.$eval('.account', (e) => e.outerHTML.slice(0, 160)).catch(() => 'no .account'), (await hook('/__test/log')).slice(-8));
  const kept = await until(async () => (await savedTitles(A)).includes('Đen Vâu - Bài Này Chill Phết'), 3000);
  check('expired session → "expired" shown, the new favorite is kept on the device', Boolean(exp) && Boolean(kept));
  if (process.env.DBG) console.log('after exp', await status(A), await savedTitles(A));
  await A.p.click('.account__btn');
  if (process.env.DBG) console.log('menu', await A.p.$eval('.account__menu', (e) => e.innerText).catch(() => 'no menu'));
  await A.p.click('.account__menu button:has-text("Đăng nhập lại")');
  await A.p.waitForSelector('.auth-dialog');
  await login(A, 'an@test.dev');
  const resumed = await until(async () => (await rows('favorites')).some((r) => r.track_id === 'v2aaaaaaaaa' && !r.deleted), 10000);
  check('after signing in again the queued change is synced', Boolean(resumed));

  // ---------- 10. password reset ----------
  await A.p.click('.account__btn'); await A.p.click('.account__menu button:has-text("Đăng xuất")');
  await A.p.waitForSelector('.account--guest');
  await openDialog(A);
  await A.p.click('.auth-links button:has-text("Quên mật khẩu")');
  await A.p.fill('input[type="email"]', 'an@test.dev');
  await A.p.click('.auth-submit');
  await A.p.waitForSelector('.auth-msg--ok');
  const { code } = await hook('/__test/recovery?email=an@test.dev');
  // the e-mail link: supabase-js needs the PKCE verifier it stored when the reset was requested
  await A.p.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.endsWith('-code-verifier')); if (k) localStorage.setItem(k, localStorage.getItem(k).replace(/(\/PASSWORD_RECOVERY)?("?)$/, '/PASSWORD_RECOVERY$2')); });
  await A.p.goto(`${URL0}/auth/reset?code=${code}`);
  await A.p.waitForSelector('input[autocomplete="new-password"]', { timeout: 8000 }).catch(() => {});
  const onReset = await A.p.$('input[autocomplete="new-password"]');
  if (onReset) {
    await A.p.fill('input[autocomplete="new-password"] >> nth=0', 'newpassword9');
    await A.p.fill('input[autocomplete="new-password"] >> nth=1', 'newpassword9');
    await A.p.click('button:has-text("Lưu mật khẩu")');
    await A.p.waitForTimeout(800);
  }
  const relog = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: 'x', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'an@test.dev', password: 'newpassword9' }) });
  check('password reset: link → new password form → can sign in with it', Boolean(onReset) && relog.status === 200);

  // ---------- 11. Car View: account entry fits ----------
  const D = await device('D', { viewport: { width: 800, height: 480 }, mode: 'car' });
  await D.p.goto(URL0 + '/');
  await D.p.waitForSelector('.account__login-icon');
  const box = await D.p.$eval('.account__login-icon', (e) => e.getBoundingClientRect());
  check('Car View 800×480: login button ≥ 44px, no overflow', box.width >= 44 && box.height >= 44 && !(await D.p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await D.p.click('.account__login-icon');
  await D.p.waitForSelector('.auth-dialog');
  const dlg = await D.p.$eval('.auth-dialog', (e) => { const r = e.getBoundingClientRect(); return r.width <= innerWidth && r.left >= 0; });
  check('Car View: sign-in dialog fits the screen', dlg);

  // ---------- 12. limits ----------
  // guest at the favorites limit: the app says so instead of failing later
  const E = await device('E');
  await E.ctx.addInitScript(() => {
    if (sessionStorage.getItem('preloaded')) return;
    sessionStorage.setItem('preloaded', '1');
    const saved = Array.from({ length: 5000 }, (_, i) => ({ id: `yt:z${String(i).padStart(10, '0')}`, provider: 'youtube', videoId: `z${String(i).padStart(10, '0')}`, title: `Bài ${i}`, channel: 'X', channelId: null, views: null, duration: 200, isLive: false, license: 'standard', addedAt: 1000 + i }));
    localStorage.setItem('ambertube:v1', JSON.stringify({ saved, history: [], playlists: [], downloads: [], settings: {} }));
  });
  await playAndLike(E, 0);
  await E.p.waitForTimeout(400);
  if (process.env.DBG) console.log('E toast', await E.p.textContent('.toast-stack'), (await savedTitles(E)).length);
  check('favorites limit (5,000): clear message, nothing added', /tối đa 5\.000 bài yêu thích/.test(await E.p.textContent('.toast-stack')) && (await savedTitles(E)).length === 5000);
  // account already at the limit on the server: the new favorite stays local, the user is told, no retry loop
  const F = await device('F');
  await F.p.goto(URL0 + '/');
  await register(F, 'full@test.dev');
  await F.p.waitForSelector('.account__btn', { timeout: 8000 });
  await until(async () => (await status(F)) === 'synced');
  const tokF = await F.p.evaluate(() => JSON.parse(localStorage.getItem('ambertube-auth')).access_token);
  const uidF = await F.p.evaluate(() => JSON.parse(localStorage.getItem('ambertube-auth')).user.id);
  const bulk = Array.from({ length: 5000 }, (_, i) => ({ user_id: uidF, provider: 'youtube', track_id: `f${String(i).padStart(10, '0')}`, track: { title: `Bài ${i}` }, deleted: false }));
  const bres = await fetch(`${SB}/rest/v1/favorites`, { method: 'POST', headers: { apikey: 'x', authorization: `Bearer ${tokF}`, 'content-type': 'application/json', prefer: 'return=minimal' }, body: JSON.stringify(bulk) });
  const over = await fetch(`${SB}/rest/v1/favorites`, { method: 'POST', headers: { apikey: 'x', authorization: `Bearer ${tokF}`, 'content-type': 'application/json' }, body: JSON.stringify([{ user_id: uidF, provider: 'youtube', track_id: 'onetoomany1', track: {} }]) }).then((r) => r.json());
  check('server refuses the 5,001st favorite (database limit)', bres.status === 201 && /AMBERTUBE_LIMIT:favorites:5000/.test(over.message || ''), `${bres.status} ${over.message}`);
  await F.p.goto(URL0 + '/search?q=den'); await F.p.waitForSelector('.video-row');
  await F.p.click('button[aria-label="Tùy chọn khác cho Vũ. - Lạ Lùng"]');
  await F.p.click('.menu button:has-text("Thêm vào yêu thích")');
  const warned = await until(async () => /chưa được đồng bộ vì tài khoản đã đạt giới hạn/.test(await F.p.textContent('.toast-stack')), 15000);
  check('sync over the limit: user is told; status stays healthy (no error loop)', Boolean(warned) && (await status(F)) === 'synced', String(await status(F)));
  const callsBefore = (await hook('/__test/log')).filter((l) => l.includes('/rest/v1/favorites') && l.startsWith('POST')).length;
  await F.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await F.p.waitForTimeout(2500);
  const callsAfter = (await hook('/__test/log')).filter((l) => l.includes('/rest/v1/favorites') && l.startsWith('POST')).length;
  check('the refused favorite is not re-sent on every sync', callsAfter === callsBefore, `${callsBefore} → ${callsAfter}`);

  // ---------- security: bundle ----------
  const dir = '/tmp/dist-sync/assets';
  const bundle = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  check('bundle contains only the publishable key (no service_role / secret key)', !/service_role"?\s*[:=]|sb_secret_[A-Za-z0-9]/.test(bundle.replace(/role === 'service_role'|role==="service_role"|"service_role"/g, '')) && bundle.includes('sb_publishable_test_key_for_fake_server_123'));
  for (const d of [A, B, D, E, F]) check(`no page errors on ${d.name}`, d.errs.length === 0, d.errs.join(' | ').slice(0, 300));

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
