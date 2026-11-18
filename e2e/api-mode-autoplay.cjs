// Smart Autoplay in API mode, with the YouTube Data API mocked at the network level and a fake IFrame player.
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
      loadVideoById({ videoId }) { this.vid = videoId; this.t = 0; setTimeout(() => { this.since = performance.now(); this._s(1); }, 20); }
      cueVideoById({ videoId }) { this.vid = videoId; this._s(5); }
      playVideo() { this.since = performance.now(); this._s(1); } pauseVideo() { this._s(2); } stopVideo() {}
      seekTo(s) { this.t = s; this.since = performance.now(); }
      getCurrentTime() { return this.since ? this.t + (performance.now() - this.since) / 1000 : this.t; }
      getDuration() { return 270; } setVolume() {} mute() {} unMute() {} setPlaybackRate() {} getPlaybackRate() { return 1; }
      getAvailablePlaybackRates() { return [0.5, 1, 1.5, 2]; } getVideoData() { return { video_id: this.vid, title: '', author: '' }; }
    }
    window.YT = { Player };
  });
  const p = await ctx.newPage();
  let fails = 0;
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fails++; };
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto((process.env.AMBERTUBE_API_URL || 'http://localhost:4174') + '/');
  await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.fill('.searchbar__input', 'đen vâu'); await p.keyboard.press('Enter');
  await p.waitForSelector('.video-row');
  await p.click('.video-row >> nth=0');
  await p.waitForTimeout(2500);
  await p.keyboard.press('q');
  await p.waitForTimeout(500);
  const q1 = await p.$$eval('.queue__item .queue__title', (e) => e.map((x) => x.textContent));
  const r1 = await p.$$eval('.queue__item', (els) => els.map((e) => (e.querySelector('.queue__title')?.textContent ?? '') + ' «' + (e.querySelector('.queue__reason')?.textContent ?? '') + '»'));
  if (process.env.DEBUG) console.log(r1.join('\n'));
  check('playing a search result starts similar songs after it', (await p.$$('.queue__reason')).length >= 5, q1.slice(0, 4).join(' | '));
  const firstSearches = calls.filter((c) => c.startsWith('search:'));
  // cached results are reused first; at most 2 targeted searches widen the pool (max 2 songs per artist)
  check('first batch: cached results + at most 2 targeted searches', firstSearches.length <= 3, firstSearches.join(', '));
  check('candidate searches never use the song title (that only finds re-uploads of the same song)', !firstSearches.some((c) => /lối nhỏ/i.test(c)), firstSearches.join(', '));
  const artists = q1.map((t) => t.split(' - ')[0]);
  check('Smart Autoplay mixes artists (no artist more than 2 times)', Object.values(artists.slice(1).reduce((m, a) => ((m[a] = (m[a] || 0) + 1), m), {})).every((n) => n <= 2), artists.join(' | '));
  for (let i = 0; i < 6; i++) { await p.click('button[aria-label^="Bài tiếp theo"]'); await p.waitForTimeout(500); }
  await p.waitForTimeout(4500); // refills run ~2.5 s after a song starts (idle time), never during track loading
  const upcoming = await p.$$eval('.queue__item', (els) => { const i = els.findIndex((e) => e.classList.contains('is-current')); return els.slice(i + 1).map((e) => e.querySelector('.queue__title').textContent); });
  check('queue keeps refilling with new related videos', upcoming.length >= 3, upcoming.slice(0, 3).join(' | '));
  check('extra searches stay within budget', calls.filter((c) => c.startsWith('search:')).length <= 4, `${calls.filter((c) => c.startsWith('search:')).length} searches`);
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  await b.close();
})();
