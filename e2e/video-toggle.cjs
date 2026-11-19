// Desktop "Xem video" button: shows the YouTube video above the player bar without restarting playback.
// Needs the API build (VITE_YOUTUBE_API_KEY=TEST_KEY … --outDir /tmp/dist-api, preview on 4174).
const { chromium } = require('playwright');
const URL0 = process.env.AMBERTUBE_API_URL || 'http://localhost:4174';
const vids = [['v1aaaaaaaaa', 'Đen Vâu - Lối Nhỏ', 'Đen Vâu Official', 270], ['v2aaaaaaaaa', 'Đen Vâu - Bài Này Chill Phết', 'Đen Vâu Official', 280]];
const resource = ([id, title, ch, dur]) => ({ id, snippet: { title, channelTitle: ch, channelId: 'UCx', liveBroadcastContent: 'none', thumbnails: {} }, contentDetails: { duration: `PT${Math.floor(dur / 60)}M${dur % 60}S` }, statistics: { viewCount: '1' }, status: { license: 'youtube' } });
(async () => {
  const b = await chromium.launch();
  let fails = 0;
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fails++; };
  async function page(viewport, mode = 'desktop') {
    const ctx = await b.newContext({ viewport, deviceScaleFactor: 2 });
    await ctx.route('https://www.googleapis.com/youtube/v3/**', (route) => {
      const u = new URL(route.request().url());
      if (u.pathname.endsWith('/search')) return route.fulfill({ json: { items: vids.map(([id]) => ({ id: { videoId: id } })) } });
      return route.fulfill({ json: { items: u.searchParams.get('chart') ? [] : vids.map(resource) } });
    });
    await ctx.route('https://i.ytimg.com/**', (r) => r.abort());
    await ctx.route('https://ws.audioscrobbler.com/**', (r) => r.fulfill({ json: { tracks: { track: [] }, topartists: { artist: [] } } }));
    await ctx.addInitScript((m) => {
      if (!sessionStorage.getItem('i')) { localStorage.clear(); localStorage.setItem('ambertube:display-mode', m); localStorage.setItem('ambertube:car-suggest-dismissed', '1'); sessionStorage.setItem('i', '1'); }
      window.__loads = 0;
      class Player { constructor(el, o) { window.__players = (window.__players || 0) + 1; this.o = o; el.style.background = 'linear-gradient(135deg,#3a6,#236)'; el.textContent = 'VIDEO'; setTimeout(() => o.events.onReady({ target: this }), 10); }
        _s(s) { this.state = s; this.o.events.onStateChange({ target: this, data: s }); }
        loadVideoById({ videoId }) { window.__loads++; this.vid = videoId; setTimeout(() => { this.since = performance.now(); this._s(1); }, 20); }
        cueVideoById() { this._s(5); } playVideo() { this._s(1); } pauseVideo() { this._s(2); } stopVideo() {} seekTo() {}
        getCurrentTime() { return this.since ? (performance.now() - this.since) / 1000 : 0; } getDuration() { return 270; } getPlayerState() { return this.state ?? -1; }
        setVolume() {} mute() {} unMute() {} setPlaybackRate() {} getPlaybackRate() { return 1; } getAvailablePlaybackRates() { return [1]; } getVideoData() { return {}; } }
      window.YT = { Player };
    }, mode);
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
    return { ctx, p, errs };
  }
  const host = (p) => p.$eval('.yt-host', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom, vis: e.classList.contains('yt-host--visible') }; });
  const playing = (p) => p.evaluate(() => document.querySelector('.play-btn')?.getAttribute('aria-label') === 'Tạm dừng');

  // ---- desktop
  {
    const { ctx, p, errs } = await page({ width: 1440, height: 900 });
    await p.goto(URL0 + '/search?q=den'); await p.waitForSelector('.video-row');
    check('button disabled before a YouTube song plays', await p.$eval('.player__video', (e) => e.disabled));
    await p.click('.video-row >> nth=0'); await p.waitForTimeout(500);
    const loads0 = await p.evaluate(() => window.__loads);
    await p.click('.player__video');
    await p.waitForSelector('.video-dock');
    const h = await host(p);
    const bar = await p.$eval('.player', (e) => e.getBoundingClientRect().top);
    check('click "Xem video" → video window above the player bar (16:9, ≥ 200px tall per YouTube)', h.vis && h.w >= 356 && Math.abs(h.h - h.w * 9 / 16) < 2 && h.b <= bar && h.r <= 1440 && h.h >= 200, JSON.stringify(h));
    check('music keeps playing, the video is NOT reloaded, still one player', (await playing(p)) && (await p.evaluate(() => window.__loads)) === loads0 && (await p.evaluate(() => window.__players)) === 1);
    check('button shows it is on; title in the window', (await p.getAttribute('.player__video', 'aria-pressed')) === 'true' && (await p.textContent('.video-dock__title')) === 'Đen Vâu - Lối Nhỏ');
    await p.screenshot({ path: '/tmp/video-dock.png' });
    await p.click('.video-dock__screen'); await p.waitForTimeout(200);
    check('click on the picture pauses (AmberTube controls the player)', !(await playing(p)));
    await p.click('.video-dock__screen'); await p.waitForTimeout(200);
    await p.click('button[aria-label="Toàn màn hình"]'); await p.waitForTimeout(500);
    const fs = await host(p);
    const fsInfo = await p.evaluate(() => ({ native: document.fullscreenElement?.className || null, full: !!document.querySelector('.video-stage--full') }));
    check('"Toàn màn hình" → the video fills the whole screen', fsInfo.full && fs.x === 0 && fs.y === 0 && fs.w === 1440 && fs.h === 900, `${JSON.stringify(fs)} ${JSON.stringify(fsInfo)}`);
    check('full screen: still the same player, not reloaded, music playing', (await playing(p)) && (await p.evaluate(() => window.__loads)) === loads0 && (await p.evaluate(() => window.__players)) === 1);
    check('full screen: title + play/pause, next/previous, seek bar, time, exit button', await p.isVisible('.video-full__id') && await p.isVisible('.video-full__bottom .play-btn') && await p.isVisible('.video-full__bottom .progress__input') && /\d:\d\d \/ \d:\d\d/.test(await p.textContent('.video-full__time')) && await p.isVisible('.video-full__exit'));
    await p.screenshot({ path: '/tmp/video-full.png' });
    await p.click('.video-full__bottom .play-btn'); await p.waitForTimeout(200);
    check('full screen controls drive the player', !(await playing(p)));
    await p.click('.video-full__bottom .play-btn'); await p.waitForTimeout(200);
    await p.mouse.move(700, 400); await p.waitForTimeout(3000);
    check('controls fade out after 2.5 s without moving the mouse (while playing)', await p.$eval('.video-stage', (e) => e.classList.contains('is-idle')));
    await p.mouse.move(720, 420); await p.waitForTimeout(100);
    check('moving the mouse brings them back', !(await p.$eval('.video-stage', (e) => e.classList.contains('is-idle'))));
    await p.click('.video-full__exit'); await p.waitForTimeout(400);
    const back = await host(p);
    check('exit → back to the small window above the player bar, still playing', !(await p.$('.video-stage--full')) && back.w >= 356 && back.b <= bar && (await playing(p)), JSON.stringify(back));
    await p.dblclick('.video-dock__screen'); await p.waitForTimeout(400);
    check('double-click on the video → full screen', Boolean(await p.$('.video-stage--full')));
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    if (await p.$('.video-stage--full')) await p.click('.video-full__exit');
    check('Esc leaves full screen', !(await p.$('.video-stage--full')));
    await p.keyboard.press('q'); await p.waitForTimeout(400);
    const panelLeft = await p.$eval('.queue.side-panel.is-open', (e) => e.getBoundingClientRect().left).catch(() => null);
    const shifted = await host(p);
    check('queue panel open → the video moves left, not over the panel', panelLeft === null ? shifted.r <= 1440 - 360 : shifted.r <= panelLeft + 1, `${shifted.r} vs ${panelLeft}`);
    await p.keyboard.press('q');
    await p.click('.video-row >> nth=1'); await p.waitForTimeout(500);
    check('next song: the window follows (same player, new title)', (await p.textContent('.video-dock__title')) === 'Đen Vâu - Bài Này Chill Phết' && (await p.evaluate(() => window.__players)) === 1);
    await p.goto(URL0 + '/artists').catch(() => {});
    await p.evaluate(() => history.pushState({}, '', '/')); // in-app navigation keeps the window
    await p.click('.nav-item:has-text("Thư viện")'); await p.waitForTimeout(300);
    check('remembered after reload; stays open while navigating', (await host(p)).vis);
    await p.keyboard.press('v'); await p.waitForTimeout(200);
    check('V hides it; host back off-screen', !(await host(p)).vis && (await host(p)).x < -1000 && !(await p.$('.video-dock')));
    await p.keyboard.press('v'); await p.waitForTimeout(200);
    await p.click('button[aria-label="Ẩn video"]'); await p.waitForTimeout(200);
    check('× hides it', !(await host(p)).vis);
    check('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  // ---- Car View: never shows video
  {
    const { ctx, p } = await page({ width: 800, height: 480 }, 'car');
    await p.goto(URL0 + '/'); await p.evaluate(() => localStorage.setItem('ambertube:video', JSON.stringify({ open: true, large: false })));
    await p.goto(URL0 + '/search?q=den'); await p.waitForSelector('.video-row');
    await p.click('.video-row >> nth=0'); await p.waitForTimeout(500);
    await p.keyboard.press('v'); await p.waitForTimeout(200);
    check('Car View: no video even if it was left on (safety), V does nothing', !(await host(p)).vis && !(await p.$('.video-dock')) && !(await p.$('.player__video')));
    await ctx.close();
  }
  // ---- small desktop window: still fits
  {
    const { ctx, p } = await page({ width: 1024, height: 640 });
    await p.goto(URL0 + '/search?q=den'); await p.waitForSelector('.video-row');
    await p.click('.video-row >> nth=0'); await p.waitForTimeout(400);
    await p.click('.player__video'); await p.waitForTimeout(300);
    const h = await host(p);
    const barTop = await p.$eval('.player', (e) => e.getBoundingClientRect().top);
    const dockTop = await p.$eval('.video-dock__bar', (e) => e.getBoundingClientRect().top);
    check('1024×640: whole window (incl. its title bar) on screen, above the player bar', dockTop >= 0 && h.b <= barTop && h.x >= 0, `top ${dockTop}, ${JSON.stringify(h)}`);
    await p.click('button[aria-label="Toàn màn hình"]'); await p.waitForTimeout(400);
    const f = await host(p);
    check('1024×640 full screen fills the screen', f.w === 1024 && f.h === 640);
    check('no horizontal overflow', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    await ctx.close();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  await b.close();
})();
