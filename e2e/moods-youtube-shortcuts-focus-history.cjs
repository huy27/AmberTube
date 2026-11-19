const { chromium } = require('playwright');
const BASE = process.env.AMBERTUBE_URL || 'http://localhost:4173';
let fails = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!cond) fails++; };
const secs = (s) => s.split(':').reduce((a, b) => a * 60 + Number(b), 0);

// Fake YouTube IFrame API (the sandbox has no network access to YouTube)
const FAKE_YT = () => {
  window.__yt = { rates: [0.25, 0.5, 1, 1.5, 2] };
  class Player {
    constructor(el, opts) { this.o = opts; this.t = 0; this.rate = 1; this.state = -1; setTimeout(() => opts.events.onReady({ target: this }), 20); }
    _set(s) { this.state = s; this.o.events.onStateChange({ target: this, data: s }); }
    loadVideoById({ videoId, startSeconds }) {
      this.vid = videoId; this.t = startSeconds || 0;
      if (videoId === 'BlockedVid1') return setTimeout(() => this.o.events.onError({ target: this, data: 150 }), 30);
      this._set(3); setTimeout(() => { this.since = performance.now(); this._set(1); }, 30);
    }
    cueVideoById({ videoId }) { this.vid = videoId; this._set(5); }
    playVideo() { this.since = performance.now(); this._set(1); }
    pauseVideo() { this.t = this.getCurrentTime(); this.since = null; this._set(2); }
    stopVideo() { this.since = null; this.vid = null; }
    seekTo(s) { this.t = s; if (this.since) this.since = performance.now(); }
    getCurrentTime() { return this.since ? this.t + (performance.now() - this.since) / 1000 * this.rate : this.t; }
    getDuration() { return 600; }
    setVolume(v) { window.__yt.volume = v; } mute() { window.__yt.muted = true; } unMute() { window.__yt.muted = false; }
    setPlaybackRate(r) { this.t = this.getCurrentTime(); if (this.since) this.since = performance.now(); this.rate = r; window.__yt.rate = r; }
    getPlaybackRate() { return this.rate; }
    getAvailablePlaybackRates() { return window.__yt.rates; }
    getVideoData() { return { video_id: this.vid, title: 'Fake YT ' + this.vid, author: 'Fake Channel' }; }
    destroy() {}
  }
  window.YT = { Player };
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 880 } });
  await ctx.addInitScript(FAKE_YT);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(BASE + '/');
  await p.evaluate(() => localStorage.clear());
  await p.reload();

  // ---------- Mood & Discovery ----------
  const moods = await p.$$eval('.mood__label', (e) => e.map((x) => x.textContent));
  check('11 mood categories on Home (incl. English music)', moods.join(',') === 'Lo-fi,Thư giãn,Tập trung,Làm việc sâu,Tiếng mưa,Ngủ ngon,Tập luyện,Vui vẻ,Buồn,Acoustic,Nhạc tiếng Anh', moods.join(','));
  await p.click('.mood:has-text("Tập luyện")');
  await p.waitForURL(/\/search/);
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
  check('mood runs a search', decodeURIComponent(new URL(p.url()).searchParams.get('q')) === 'workout music');
  check('workout results relevant', /Gym|Neon/.test(await p.textContent('.video-row__title >> nth=0')), await p.textContent('.video-row__title >> nth=0'));
  for (const [m, re] of [['Tiếng mưa', /Rain/], ['Ngủ ngon', /Sleep|Drone|Rain|Tidal/], ['Buồn', /Letters|Lanterns/], ['Làm việc sâu', /Deep|Overpass/]]) {
    await p.goto(BASE + '/search');
    await p.click(`.mood:has-text("${m}")`);
    await p.waitForSelector('.video-row:not(.video-row--skeleton)');
    check(`mood "${m}" results`, re.test(await p.textContent('.video-row__title >> nth=0')), await p.textContent('.video-row__title >> nth=0'));
  }

  // ---------- YouTube provider (fake API) ----------
  await p.fill('.searchbar__input', 'https://youtu.be/AbCdEfGh123');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
  await p.click('.video-row >> nth=0');
  await p.waitForTimeout(800);
  check('YouTube track plays via IFrame engine', (await p.getAttribute('.play-btn', 'aria-label')) === 'Tạm dừng');
  check('title filled from player metadata', (await p.textContent('.player__title')) === 'Fake YT AbCdEfGh123');
  check('YouTube player is not visible', await p.$eval('.yt-host', (el) => el.getBoundingClientRect().right < 0));
  await p.click('.speed .popover__trigger');
  const ytSpeeds = await p.$$eval('.speed .popover__item', (e) => e.map((x) => x.textContent));
  check('only provider-supported speeds shown', ytSpeeds.join('|') === '0.5x|Bình thường (1.0x)|1.5x|2.0x', ytSpeeds.join('|'));
  await p.click('.speed .popover__item:has-text("1.5x")');
  check('speed applied to YouTube immediately', (await p.evaluate(() => window.__yt.rate)) === 1.5);
  check('YouTube decorative visualizer', (await p.getAttribute('.visualizer canvas', 'data-source')) === 'decorative');

  // embedding-disabled video is skipped
  await p.fill('.searchbar__input', 'https://youtu.be/BlockedVid1');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
  await p.click('.video-row >> nth=0 >> .more__btn');
  await p.click('.menu >> text=Phát tiếp theo');
  await p.click('button[aria-label^="Bài tiếp theo"]');
  await p.waitForTimeout(600);
  check('blocked YouTube video explained', /không cho phép phát video/.test(await p.textContent('.toast-stack')));

  // ---------- Keyboard shortcuts ----------
  await p.goto(BASE + '/search?q=ambient');
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
  await p.click('.video-row >> nth=0');
  await p.waitForTimeout(600);
  await p.evaluate(() => document.activeElement?.blur()); // focus nothing in particular
  const t0 = await p.textContent('.player__title');
  await p.keyboard.press('Space');
  check('Space pauses', (await p.getAttribute('.play-btn', 'aria-label')) === 'Phát');
  await p.keyboard.press('Space');
  check('Space plays', (await p.getAttribute('.play-btn', 'aria-label')) === 'Tạm dừng');
  await p.keyboard.press('Control+ArrowRight');
  await p.waitForTimeout(400);
  const t1 = await p.textContent('.player__title');
  check('Ctrl+→ next track', t1 !== t0, `${t0} → ${t1}`);
  await p.keyboard.press('Control+ArrowLeft');
  await p.waitForTimeout(400);
  check('Ctrl+← previous track', (await p.textContent('.player__title')) === t0);
  const v0 = Number(await p.inputValue('.slider'));
  await p.keyboard.press('ArrowUp');
  check('↑ volume up', Number(await p.inputValue('.slider')) === Math.min(100, v0 + 5), `${v0} → ${await p.inputValue('.slider')}`);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
  check('↓ volume down', Number(await p.inputValue('.slider')) === v0 - 5);
  await p.keyboard.press('m');
  check('M mutes', (await p.inputValue('.slider')) === '0');
  await p.keyboard.press('m');
  check('M unmutes', Number(await p.inputValue('.slider')) === v0 - 5);
  await p.keyboard.press('s');
  check('S toggles shuffle', (await p.getAttribute('button[aria-label^="Trộn bài"]', 'aria-pressed')) === 'true');
  await p.keyboard.press('r');
  check('R cycles repeat', (await p.getAttribute('button[aria-label^="Lặp lại"]', 'aria-label')).startsWith('Lặp lại: tất cả'));
  // typing in the search box must not trigger shortcuts
  await p.fill('.searchbar__input', '');
  await p.keyboard.type('m s r ');
  check('shortcuts ignored while typing', (await p.inputValue('.searchbar__input')) === 'm s r ' && (await p.getAttribute('button[aria-label^="Trộn bài"]', 'aria-pressed')) === 'true' && (await p.getAttribute('.play-btn', 'aria-label')) === 'Tạm dừng');
  await p.keyboard.press('Escape');

  // ---------- Listening history ----------
  await p.click('.nav-item:has-text("Lịch sử")');
  await p.waitForSelector('.history-item');
  const items = await p.$$('.history-item');
  check('history lists played tracks', items.length >= 3, `${items.length} entries`);
  check('grouped by date', (await p.textContent('.history-group .section-title')) === 'Hôm nay');
  const e0 = await p.$eval('.history-item', (li) => [li.querySelector('.history-item__thumb .artwork') !== null, li.querySelector('.history-item__title').textContent, li.querySelector('.history-item__sub').textContent, li.querySelector('time').textContent]);
  check('entry shows thumbnail, title, channel, time', e0[0] && e0[1] && e0[2] && /\d{1,2}:\d{2}/.test(e0[3]), e0.slice(1).join(' | '));
  const firstTitle = await p.textContent('.history-item__title >> nth=1');
  await p.click('.history-item >> nth=1 >> text=Phát lại');
  await p.waitForTimeout(500);
  check('Play again', (await p.textContent('.player__title')) === firstTitle);
  const before = (await p.$$('.history-item')).length;
  await p.click('.history-item >> nth=-1 >> button[aria-label^="Xóa"]');
  check('remove one entry', (await p.$$('.history-item')).length === before - 1);
  await p.reload();
  await p.waitForSelector('.history-item');
  check('history persists after reload', (await p.$$('.history-item')).length >= before - 1);
  p.once('dialog', (d) => d.accept());
  await p.click('text=Xóa lịch sử');
  check('clear history', (await p.$$('.history-item')).length === 0 && /Chưa có lịch sử nghe/.test(await p.textContent('.page')));

  // ---------- Settings shows shortcuts ----------
  await p.click('.nav-item:has-text("Cài đặt")');
  await p.waitForSelector('.shortcuts tr'); // Settings is code-split: wait for it to load
  const rows = await p.$$eval('.shortcuts tr', (e) => e.map((x) => x.textContent));
  check('shortcuts listed in Settings', rows.length >= 8 && rows.some((r) => r.includes('Tăng âm lượng')), `${rows.length} rows`);

  // ---------- Favorites ----------
  await p.click('button[aria-label="Thêm vào yêu thích"]');
  await p.reload();
  await p.click('.nav-item:has-text("Thư viện")');
  await p.waitForSelector('.video-row', { timeout: 5000 }).catch(() => {}); // Library is code-split
  check('favorites persist', (await p.$$('.video-row')).length === 1);

  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
})();
