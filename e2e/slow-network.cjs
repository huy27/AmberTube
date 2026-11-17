// Slow network: after picking a song (e.g. from the queue) the UI must clearly show it is loading,
// must not claim autoplay was blocked, and must start playing once the video arrives.
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
      _s(s) { this.o.events.onStateChange({ target: this, data: s }); }
      loadVideoById({ videoId }) { this.vid = videoId; this.t = 0; clearTimeout(this.endT); clearTimeout(this.slowT); if (window.__slow) { this.state = -1; this._s(-1); this.slowT = setTimeout(() => { this._s(3); this.slowT = setTimeout(() => { this.since = performance.now(); this.state = 1; this._s(1); }, 3000); }, 6000); return; } setTimeout(() => { this.since = performance.now(); this.state = 1; this._s(-1); this._s(3); this._s(1); this.endT = setTimeout(() => { this.t = 6; this.since = null; this.state = 0; if (!window.__dropEnded) this._s(0); }, 6000); }, 20); }
      cueVideoById({ videoId }) { this.vid = videoId; this._s(5); }
      playVideo() { this.since = performance.now(); this._s(1); } pauseVideo() { this.t = this.getCurrentTime(); this.since = null; clearTimeout(this.endT); this._s(2); } stopVideo() {}
      seekTo(s) { this.t = s; this.since = performance.now(); }
      getCurrentTime() { return this.since ? this.t + (performance.now() - this.since) / 1000 : this.t; }
      getDuration() { return 6; } getPlayerState() { return this.state ?? -1; } setVolume() {} mute() {} unMute() {} setPlaybackRate() {} getPlaybackRate() { return 1; }
      getAvailablePlaybackRates() { return [0.5, 1, 1.5, 2]; } getVideoData() { return { video_id: this.vid, title: '', author: '' }; }
    }
    if (sessionStorage.getItem('drop')) window.__dropEnded = true;
    if (sessionStorage.getItem('slow')) window.__slow = true;
    window.YT = { Player };
  });
  let fails = 0;
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fails++; };
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto((process.env.AMBERTUBE_API_URL || 'http://localhost:4174') + '/');
  await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.fill('.searchbar__input', 'đen vâu'); await p.keyboard.press('Enter');
  await p.waitForSelector('.video-row'); await p.waitForTimeout(400);
  await p.click('.video-row >> nth=0'); await p.waitForTimeout(2000);
  await p.keyboard.press('q'); await p.waitForTimeout(500);
  await p.evaluate(() => { window.__slow = true; sessionStorage.setItem('slow', '1'); });
  const title = await p.textContent('.queue__main >> nth=2 >> .queue__title');
  await p.click('.queue__main >> nth=2'); await p.waitForTimeout(400);
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  check('clicked song becomes current immediately', (await p.textContent('.player__title')) === title, title);
  check('queue row shows a loading spinner', await p.isVisible('.queue__item.is-current .queue__eq .spin'));
  check('player shows "Đang tải…"', /Đang tải/.test(await p.textContent('.player__time')));
  check('play button shows a spinner', await p.isVisible('.play-btn .spin'));
  check('progress bar shows loading', await p.isVisible('.progress.is-loading'));
  await p.waitForTimeout(5600);
  check('slow network explained (toast)', /Mạng chậm/.test(await p.textContent('.toast-stack')));
  check('not mistaken for blocked autoplay', !(await p.isVisible('.autoplay-blocked')));
  await p.waitForTimeout(3500);
  check('starts playing once the video arrives', !(await p.isVisible('.play-btn .spin')) && (await p.getAttribute('.play-btn', 'aria-label')) === 'Tạm dừng' && !/Đang tải/.test(await p.textContent('.player__time')));
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  await b.close();
})();
