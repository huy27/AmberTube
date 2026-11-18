// Page lifecycle + Media Session (phone background playback support). Desktop Chromium cannot prove
// iOS background audio; this checks the app-side logic: Lock Screen metadata/actions, and that the UI
// resyncs with what the player is actually doing after the page was hidden.
// (derived from autoplay-advance.cjs)
// Auto-advance with the YouTube engine: songs must move on by themselves when they end — via the ENDED event,
// via the polling fallback when the ENDED event is lost, and even if an old 'Tự động phát' setting was off.
// Fake IFrame player; YouTube Data API mocked at the network level.
// Needs a build that has an API key:  VITE_YOUTUBE_API_KEY=TEST npx vite build --outDir /tmp/dist-api
//                                     npx vite preview --outDir /tmp/dist-api --port 4174
// then: AMBERTUBE_API_URL=http://localhost:4174 node e2e/api-mode-autoplay.cjs
const { chromium } = require('playwright');
const vids = [
  ['v1aaaaaaaaa', 'Đen Vâu - Lối Nhỏ', 'Đen Vâu Official', 270],
  ['v2aaaaaaaaa', 'Đen Vâu - Bài Này Chill Phết', 'Đen Vâu Official', 280],
  ['v3aaaaaaaaa', 'Đen Vâu - Mang Tiền Về Cho Mẹ', 'Đen Vâu Official', 400],
  ['v4aaaaaaaaa', 'Vũ. - Lạ Lùng', 'Vũ.', 260],
  ['v5aaaaaaaaa', 'Chillies - Mascara', 'Chillies', 230],
  ['v6aaaaaaaaa', 'Đen Vâu - Trốn Tìm (Lyrics)', 'Lyrics Hub', 250],
  ['v7aaaaaaaaa', 'Lofi chill nhạc Việt 2026', 'Lofi Việt', 3600],
  ['v8aaaaaaaaa', 'Đen x Chi Pu - Đố Em Biết Anh Đang Nghĩ Gì', 'Đen Vâu Official', 260],
];
const resource = ([id, title, ch, dur]) => ({ id, snippet: { title, channelTitle: ch, channelId: 'UC' + ch.length, liveBroadcastContent: 'none', thumbnails: {} }, contentDetails: { duration: `PT${Math.floor(dur / 60)}M${dur % 60}S` }, statistics: { viewCount: '100000' }, status: { license: 'youtube' } });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 860 } });
  let calls = [];
  await ctx.route('https://www.googleapis.com/youtube/v3/**', (route) => {
    const u = new URL(route.request().url());
    calls.push(u.pathname.split('/').pop() + ':' + (u.searchParams.get('q') || u.searchParams.get('chart') || u.searchParams.get('id')));
    const q = (u.searchParams.get('q') || '').toLowerCase();
    if (u.pathname.endsWith('/search')) {
      if (q.includes('đen')) return route.fulfill({ json: { items: vids.map(([id]) => ({ id: { videoId: id } })) } });
      // any other query: the "real" API would return new videos — generate 5 per query
      const base = q.replace(/[^a-z0-9]/gi, '').slice(0, 6).padEnd(6, 'x');
      const extra = [1, 2, 3, 4, 5].map((k) => [`${base}${k}aaaa`.slice(0, 11), `${u.searchParams.get('q')} - Bài ${k}`, u.searchParams.get('q'), 240]);
      extra.forEach((e) => { if (!vids.some((v) => v[0] === e[0])) vids.push(e); });
      return route.fulfill({ json: { items: extra.map(([id]) => ({ id: { videoId: id } })) } });
    }
    if (u.searchParams.get('chart')) return route.fulfill({ json: { items: vids.slice(3, 6).map(resource) } });
    const ids = (u.searchParams.get('id') || '').split(',');
    return route.fulfill({ json: { items: vids.filter(([id]) => ids.includes(id)).map(resource) } });
  });
  await ctx.route('https://i.ytimg.com/**', (r) => r.abort());
  await ctx.addInitScript(() => {
    class Player {
      constructor(el, o) { this.o = o; this.t = 0; setTimeout(() => o.events.onReady({ target: this }), 10); }
      _s(s) { this.state = s; this.o.events.onStateChange({ target: this, data: s }); }
      loadVideoById({ videoId }) { window.__player = this; this.vid = videoId; this.t = 0; clearTimeout(this.endT); setTimeout(() => { this.since = performance.now(); this.state = 1; this._s(-1); this._s(3); this._s(1); this.endT = setTimeout(() => { this.t = 6; this.since = null; this.state = 0; if (!window.__dropEnded) this._s(0); }, 6000); }, 20); }
      cueVideoById({ videoId }) { this.vid = videoId; this._s(5); }
      playVideo() { this.since = performance.now(); this._s(1); } pauseVideo() { this.t = this.getCurrentTime(); this.since = null; clearTimeout(this.endT); this._s(2); } stopVideo() {}
      seekTo(s) { this.t = s; this.since = performance.now(); }
      getCurrentTime() { return this.since ? this.t + (performance.now() - this.since) / 1000 : this.t; }
      getDuration() { return 6; } getPlayerState() { return this.state ?? -1; } setVolume() {} mute() {} unMute() {} setPlaybackRate() {} getPlaybackRate() { return 1; }
      getAvailablePlaybackRates() { return [0.5, 1, 1.5, 2]; } getVideoData() { return { video_id: this.vid, title: '', author: '' }; }
    }
    if (sessionStorage.getItem('drop')) window.__dropEnded = true;
    window.__ms = {};
    if (navigator.mediaSession) { const o = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession); navigator.mediaSession.setActionHandler = (a, h) => { window.__ms[a] = h; try { o(a, h); } catch (e) { throw e; } }; }
    window.__hidden = false;
    Object.defineProperty(document, 'hidden', { get: () => window.__hidden, configurable: true });
    window.YT = { Player };
  });
  let fails = 0;
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fails++; };
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto((process.env.AMBERTUBE_API_URL || 'http://localhost:4174') + '/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ambertube:display-mode', 'desktop'); }); await p.reload();
  await p.fill('.searchbar__input', 'đen vâu'); await p.keyboard.press('Enter');
  await p.waitForSelector('.video-row'); await p.waitForTimeout(400);
  await p.click('.video-row >> nth=0'); await p.waitForTimeout(1500);
  const ms = await p.evaluate(() => ({ title: navigator.mediaSession.metadata?.title, artist: navigator.mediaSession.metadata?.artist, art: navigator.mediaSession.metadata?.artwork?.length, state: navigator.mediaSession.playbackState, actions: Object.keys(window.__ms).filter((k) => window.__ms[k]).sort().join(',') }));
  check('Lock Screen metadata: title, artist, artwork', ms.title === 'Đen Vâu - Lối Nhỏ' && !!ms.artist && ms.art >= 2, JSON.stringify(ms));
  check('playbackState = playing', ms.state === 'playing');
  check('actions: play/pause/prev/next/seek', ['nexttrack', 'pause', 'play', 'previoustrack', 'seekbackward', 'seekforward', 'seekto'].every((a) => ms.actions.includes(a)), ms.actions);
  await p.evaluate(() => window.__ms.pause()); await p.waitForTimeout(300);
  check('Lock Screen pause pauses', (await p.getAttribute('.play-btn', 'aria-label')) === 'Phát' && (await p.evaluate(() => navigator.mediaSession.playbackState)) === 'paused');
  await p.evaluate(() => window.__ms.play()); await p.waitForTimeout(300);
  check('Lock Screen play resumes', (await p.getAttribute('.play-btn', 'aria-label')) === 'Tạm dừng');
  const t1 = await p.textContent('.player__title');
  await p.evaluate(() => window.__ms.nexttrack()); await p.waitForTimeout(600);
  const t2 = await p.textContent('.player__title');
  check('Lock Screen next track', t1 !== t2, `${t1} → ${t2}`);
  await p.evaluate(() => window.__ms.previoustrack()); await p.waitForTimeout(600);
  check('Lock Screen previous track', (await p.textContent('.player__title')) === t1);
  await p.evaluate(() => window.__ms.seekto({ action: 'seekto', seekTime: 4 })); await p.waitForTimeout(400);
  check('Lock Screen seek', /^0:0[45]/.test(await p.textContent('.player__time')), await p.textContent('.player__time'));
  // page hidden: nothing is paused by the app
  await p.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(300);
  check('hiding the page does not pause playback', await p.evaluate(() => window.__player.state === 1));
  // while hidden the OS pauses the media without the app receiving the event (iOS screen lock)
  await p.evaluate(() => { window.__player.pauseVideo = window.__player.pauseVideo; window.__player.state = 2; window.__player.since = null; });
  await p.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(300);
  check('on return, UI shows the real state (paused), not "playing"', (await p.getAttribute('.play-btn', 'aria-label')) === 'Phát' && (await p.evaluate(() => navigator.mediaSession.playbackState)) === 'paused');
  await p.click('.play-btn'); await p.waitForTimeout(300);
  check('one tap resumes after returning', (await p.getAttribute('.play-btn', 'aria-label')) === 'Tạm dừng');
  check('single player instance throughout', await p.evaluate(() => document.querySelectorAll('.yt-host > *').length === 1));
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  await b.close();
})();

// iPhone/iPad: local files must play straight from the <audio> element (no Web Audio routing,
// which iOS silences when the screen locks); desktop keeps the real analyser.
(async () => {
  await new Promise((r) => setTimeout(r, 100));
  const { chromium, devices } = require('playwright');
  const path = require('path');
  const file = path.join(require('./fixtures.cjs').dir, 'Test Tone Song.wav');
  const b = await chromium.launch();
  let fails = 0;
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fails++; };
  for (const [name, opts] of [['iPhone', { ...devices['iPhone 13'], defaultBrowserType: undefined }], ['desktop', { viewport: { width: 1360, height: 860 } }]]) {
    const { defaultBrowserType, ...o } = opts;
    const ctx = await b.newContext(o);
    await ctx.addInitScript(() => { window.__ctx = 0; const C = window.AudioContext; if (C) window.AudioContext = class extends C { constructor(...a) { super(...a); window.__ctx++; } }; localStorage.setItem('ambertube:display-mode', 'desktop'); });
    const p = await ctx.newPage();
    await p.goto((process.env.AMBERTUBE_URL || 'http://localhost:4173') + '/library');
    await p.setInputFiles('input[type=file][accept="audio/*"]', file);
    await p.waitForSelector('.video-row:has-text("Test Tone Song")');
    await p.click('.video-row:has-text("Test Tone Song")');
    await p.waitForTimeout(1200);
    const r = await p.evaluate(() => ({ ctx: window.__ctx }));
    if (name === 'iPhone') check('iPhone: local file is not routed through Web Audio (no AudioContext)', r.ctx === 0, JSON.stringify(r));
    else check('desktop: local file still uses real analysis (AudioContext)', r.ctx === 1, JSON.stringify(r));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} FAILED (iOS audio routing)` : '\nALL PASSED (iOS audio routing)');
})();
