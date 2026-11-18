// Car View playback profiling: CPU throttled 6× (low-end head unit), API build with mocked YouTube Data API
// and a fake IFrame player (tracks end after TRACK_SEC). Measures main-thread work while music plays.
const { chromium } = require('playwright');
const TRACK_SEC = Number(process.env.TRACK_SEC || 20);
const RUN_SEC = Number(process.env.RUN_SEC || 150);
const MODE = process.env.MODE || 'car';
const vids = [];
for (let i = 0; i < 60; i++) vids.push([`v${String(i).padStart(2, '0')}aaaaaaaa`.slice(0, 11), `Nghệ sĩ ${i % 12} - Bài hát số ${i} (Official Audio)`, `Nghệ sĩ ${i % 12}`, 200 + i]);
const resource = ([id, title, ch, dur]) => ({ id, snippet: { title, channelTitle: ch, channelId: 'UC' + ch.length, liveBroadcastContent: 'none', thumbnails: {}, tags: ['vpop', 'ballad'], categoryId: '10' }, contentDetails: { duration: `PT${Math.floor(dur / 60)}M${dur % 60}S` }, statistics: { viewCount: '100000' }, status: { license: 'youtube' } });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: MODE === 'car' ? { width: 1280, height: 720 } : { width: 1360, height: 860 } });
  const api = [];
  await ctx.route('https://www.googleapis.com/youtube/v3/**', (route) => {
    const u = new URL(route.request().url());
    api.push(u.pathname.split('/').pop());
    if (u.pathname.endsWith('/search')) { const off = (api.length * 7) % 50; return route.fulfill({ json: { items: vids.slice(off, off + 10).map(([id]) => ({ id: { videoId: id } })) } }); }
    if (u.searchParams.get('chart')) return route.fulfill({ json: { items: vids.slice(0, 10).map(resource) } });
    const ids = (u.searchParams.get('id') || '').split(',');
    return route.fulfill({ json: { items: vids.filter(([id]) => ids.includes(id)).map(resource) } });
  });
  await ctx.route('https://i.ytimg.com/**', (r) => r.abort());
  await ctx.addInitScript(({ TRACK_SEC, MODE }) => {
    window.__stats = { players: 0, loads: 0, commits: 0, setItem: 0, setItemBytes: 0, longtasks: [], switches: [] };
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, isDisabled: false, renderers: new Map(), inject() { return 1; }, checkDCE() {}, onScheduleFiberRoot() {}, onCommitFiberRoot() { window.__stats.commits++; }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
    const si = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { window.__stats.setItem++; window.__stats.setItemBytes += String(v).length; return si.call(this, k, v); };
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__stats.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true });
    localStorage.setItem('ambertube:display-mode', MODE);
    class Player {
      constructor(el, o) { window.__stats.players++; this.o = o; this.t = 0; setTimeout(() => o.events.onReady({ target: this }), 10); }
      _s(s) { this.state = s; this.o.events.onStateChange({ target: this, data: s }); }
      loadVideoById({ videoId }) { window.__stats.loads++; window.__stats.switches.push(Math.round(performance.now())); this.vid = videoId; this.t = 0; clearTimeout(this.endT); setTimeout(() => { this.since = performance.now(); this._s(3); this._s(1); this.endT = setTimeout(() => { this.t = TRACK_SEC; this.since = null; this._s(0); }, TRACK_SEC * 1000); }, 30); }
      cueVideoById({ videoId }) { this.vid = videoId; this._s(5); }
      playVideo() { this.since = performance.now(); this._s(1); } pauseVideo() { this.t = this.getCurrentTime(); this.since = null; this._s(2); } stopVideo() {}
      seekTo(s) { this.t = s; this.since = performance.now(); }
      getCurrentTime() { return this.since ? this.t + (performance.now() - this.since) / 1000 : this.t; }
      getDuration() { return TRACK_SEC; } getPlayerState() { return this.state ?? -1; } setVolume() {} mute() {} unMute() {} setPlaybackRate() {} getPlaybackRate() { return 1; }
      getAvailablePlaybackRates() { return [1]; } getVideoData() { return { video_id: this.vid, title: '', author: '' }; }
    }
    window.YT = { Player };
  }, { TRACK_SEC, MODE });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  const cdp = await ctx.newCDPSession(p);
  await p.goto((process.env.URL || 'http://localhost:4174') + '/');
  await p.waitForTimeout(1500);
  // start music from a search
  await p.fill('.searchbar__input', 'nghệ sĩ'); await p.keyboard.press('Enter');
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
  await p.click('.video-row >> nth=0');
  await p.waitForTimeout(1500);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU || 6) });
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const s0 = await p.evaluate(() => ({ ...window.__stats, longtasks: window.__stats.longtasks.length, switches: window.__stats.switches.length }));
  const t0 = Date.now();
  const nav = async (sel) => { try { if (MODE === 'car') { await p.click('.topbar__menu', { timeout: 3000 }); await p.click(sel, { timeout: 3000 }); } else await p.click(sel, { timeout: 3000 }); } catch {} };
  const steps = [
    () => nav('a[href="/"]'), () => nav('a[href="/library"]'), () => nav('a[href="/search"]'),
    async () => { await p.fill('.searchbar__input', 'ballad'); await p.keyboard.press('Enter'); },
    () => nav('a[href="/"]'), async () => { try { await p.click('.mix-card--radio >> nth=0', { timeout: 2000 }); } catch {} },
    async () => { await p.fill('.searchbar__input', 'vpop mới'); await p.waitForTimeout(800); await p.keyboard.press('Escape'); },
    () => nav('a[href="/history"]'),
  ];
  let i = 0;
  while (Date.now() - t0 < RUN_SEC * 1000) { await p.waitForTimeout(9000); await steps[i++ % steps.length](); }
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const s1 = await p.evaluate(() => window.__stats);
  const secs = (Date.now() - t0) / 1000;
  const lt = s1.longtasks.filter(([st]) => st > (s1.longtasks[s0.longtasks]?.[0] ?? 0) - 1).slice(s0.longtasks);
  const around = lt.filter(([st]) => s1.switches.slice(s0.switches).some((sw) => Math.abs(st - sw) < 3000));
  const per = (k) => ((m1[k] - m0[k]) / secs);
  const out = {
    mode: MODE, cpuThrottle: Number(process.env.CPU || 6), seconds: Math.round(secs),
    playerInstances: s1.players, trackLoads: s1.loads - s0.loads,
    reactCommitsPerSec: +((s1.commits - s0.commits) / secs).toFixed(2),
    longTasks: lt.length, longTaskMsTotal: lt.reduce((a, [, d]) => a + d, 0), longestTaskMs: Math.max(0, ...lt.map(([, d]) => d)),
    longTasksNearTrackSwitch: around.length, worstNearSwitchMs: Math.max(0, ...around.map(([, d]) => d)),
    scriptMsPerSec: +(per('ScriptDuration') * 1000).toFixed(1), layoutMsPerSec: +(per('LayoutDuration') * 1000).toFixed(1), styleMsPerSec: +(per('RecalcStyleDuration') * 1000).toFixed(1), taskMsPerSec: +(per('TaskDuration') * 1000).toFixed(1),
    layoutsPerSec: +per('LayoutCount').toFixed(2), styleRecalcsPerSec: +per('RecalcStyleCount').toFixed(2),
    storageWritesPerMin: +((s1.setItem - s0.setItem) / secs * 60).toFixed(1), storageKBPerMin: +((s1.setItemBytes - s0.setItemBytes) / 1024 / secs * 60).toFixed(1),
    apiRequests: api.length, heapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(1), heapStartMB: +(m0.JSHeapUsedSize / 1048576).toFixed(1),
    queueLength: await p.evaluate(() => JSON.parse(localStorage.getItem('ambertube:player:v1') || '{}').queue?.length),
    errors: errs.length,
  };
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
