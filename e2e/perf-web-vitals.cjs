// Web vitals / startup profile. Fast-3G-like network + 4× CPU throttle, a returning heavy user
// (1500 listening events, 25 cached searches, 300 history entries), YouTube Data API mocked.
// Usage: node e2e/perf-web-vitals.cjs [desktop|car]   (needs the API build on :4174)
const { chromium } = require('playwright');
const MODE = process.argv[2] || 'desktop';
const N = Number(process.env.RUNS || 3);
const URL0 = process.env.URL || 'http://localhost:4174';
const vid = (i) => `p${String(i).padStart(4, '0')}aaaaaa`.slice(0, 11);
const track = (i) => ({ id: `yt:${vid(i)}`, provider: 'youtube', videoId: vid(i), title: `Nghệ sĩ ${i % 40} - Bài ${i} (Official Audio)`, channel: `Nghệ sĩ ${i % 40}`, channelId: null, views: 1e5 + i, duration: 180 + (i % 120), isLive: false, license: 'standard', tags: ['vpop', 'ballad'], genres: ['vpop', 'ballad'], categoryId: '10', thumbnail: `https://i.ytimg.com/vi/${vid(i)}/mqdefault.jpg` });
const resource = (i) => ({ id: vid(i), snippet: { title: `Nghệ sĩ ${i % 40} - Bài ${i}`, channelTitle: `Nghệ sĩ ${i % 40}`, channelId: 'UCx', liveBroadcastContent: 'none', thumbnails: { medium: { url: `https://i.ytimg.com/vi/${vid(i)}/mqdefault.jpg` } }, tags: ['vpop'], categoryId: '10' }, contentDetails: { duration: 'PT3M20S' }, statistics: { viewCount: '100000' }, status: { license: 'youtube' } });
function seed() {
  const now = Date.now();
  const events = Array.from({ length: 1500 }, (_, k) => { const t = track(k % 400); return { id: `${t.id}:${now - k * 600000}`, trackId: t.id, track: t, at: now - k * 600000, listenedSec: 60 + (k % 180), durationSec: t.duration, completion: (k % 10) / 10, reason: k % 4 ? 'ended' : 'skipped' }; });
  const cache = {}; for (let q = 0; q < 25; q++) cache[`truy vấn ${q}`] = { at: now, items: Array.from({ length: 15 }, (_, j) => track(q * 15 + j)) };
  const history = Array.from({ length: 300 }, (_, k) => ({ entryId: `h${k}`, track: track(k), playedAt: now - k * 900000 }));
  return { events, cache, history };
}
function dump(profile, label) {
  const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = profile.timeDeltas; const counts = new Map();
  profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)));
  for (const [id, t] of counts) { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + t); }
  console.log(label, [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, t]) => `${(t / 1000).toFixed(0)}ms ${k}`).join('\n'));
}
(async () => {
  const b = await chromium.launch();
  const results = [];
  const data = seed();
  for (let run = 0; run < N; run++) {
    const ctx = await b.newContext({ viewport: MODE === 'car' ? { width: 800, height: 480 } : { width: 1360, height: 860 } });
    const api = [];
    let jsBytes = 0, reqs = 0;
    await ctx.route('https://www.googleapis.com/youtube/v3/**', (route) => {
      const u = new URL(route.request().url()); api.push(u.pathname.split('/').pop() + ':' + (u.searchParams.get('q') || u.searchParams.get('chart') || 'ids'));
      if (u.pathname.endsWith('/search')) return route.fulfill({ json: { items: Array.from({ length: 10 }, (_, j) => ({ id: { videoId: vid(500 + api.length * 10 + j) } })) } });
      const ids = (u.searchParams.get('id') || '').split(',').filter(Boolean);
      return route.fulfill({ json: { items: u.searchParams.get('chart') ? Array.from({ length: 12 }, (_, j) => resource(900 + j)) : ids.map((id) => resource(Number(id.slice(1, 5)))) } });
    });
    await ctx.route('https://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.alloc(r.request().url().includes('default.jpg') && !r.request().url().includes('mq') && !r.request().url().includes('hq') ? 4000 : 16000) }));
    await ctx.route('https://www.youtube.com/**', (r) => r.abort());
    const p = await ctx.newPage();
    p.on('response', async (r) => { reqs++; if (/\.js($|\?)/.test(r.url()) && r.url().includes('localhost')) { try { jsBytes += (await r.body()).length; } catch {} } });
    await p.addInitScript(({ d, MODE }) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.clear();
        localStorage.setItem('ambertube:listens:v1', JSON.stringify(d.events));
        localStorage.setItem('ambertube:search-cache', JSON.stringify(d.cache));
        const lib = { saved: d.history.slice(0, 40).map((h) => h.track), playlists: [], history: d.history, settings: { bitrate: 192, autoplay: true, authorizedChannels: [], visualizer: 'wave', voiceLang: 'vi-VN' }, downloads: [], localTracks: [] };
        localStorage.setItem('ambertube:v1', JSON.stringify(lib));
        localStorage.setItem('ambertube:display-mode', MODE);
        sessionStorage.setItem('seeded', '1');
      }
      window.__v = { lcp: 0, cls: 0, lt: [], inp: 0, commits: 0 };
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__v.lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) { window.__v.cls += e.value; if (e.value > 0.01) (window.__v.shifts ||= []).push([Math.round(e.startTime), +e.value.toFixed(3), (e.sources || []).map((x) => x.node?.className || x.node?.nodeName).join('|')]); } })).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__v.lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.interactionId) { window.__v.inp = Math.max(window.__v.inp, e.duration); if (e.duration > 60) (window.__v.slow ||= []).push(`${e.name}:${Math.round(e.duration)}:${e.target?.className || e.target?.nodeName}:${e.target?.getAttribute?.('href') || ''}`); } })).observe({ type: 'event', buffered: true, durationThreshold: 16 });
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, isDisabled: false, renderers: new Map(), inject() { return 1; }, checkDCE() {}, onScheduleFiberRoot() {}, onCommitFiberRoot() { window.__v.commits++; }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
      class Player { constructor(el, o) { window.__v.playerInit = performance.now(); this.o = o; setTimeout(() => { window.__v.playerReady = performance.now(); o.events.onReady({ target: this }); }, 10); } loadVideoById() { setTimeout(() => this.o.events.onStateChange({ target: this, data: 1 }), 30); } cueVideoById() {} playVideo() {} pauseVideo() {} stopVideo() {} seekTo() {} getCurrentTime() { return 0; } getDuration() { return 200; } getPlayerState() { return 1; } setVolume() {} mute() {} unMute() {} setPlaybackRate() {} getPlaybackRate() { return 1; } getAvailablePlaybackRates() { return [1]; } getVideoData() { return {}; } }
      window.YT = { Player };
    }, { d: data, MODE });
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    if (process.env.PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
    await p.goto(URL0 + '/');
    await p.waitForLoadState('load');
    await p.waitForTimeout(3000);
    if (process.env.PROFILE === 'startup') { const { profile } = await cdp.send('Profiler.stop'); dump(profile, 'STARTUP'); }
    const fcp = await p.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0);
    const v0 = await p.evaluate(() => ({ ...window.__v }));
    const startupTBT = v0.lt.filter(([s]) => s < 6000).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
    const startupLongest = Math.max(0, ...v0.lt.map(([, d]) => d));
    // interactions: rapid typing, navigation, play
    const apiBeforeTyping = api.length;
    await p.click('.searchbar__input');
    await p.keyboard.type('son tung mtp chung ta', { delay: 60 });
    await p.waitForTimeout(800);
    const apiTyping = api.length - apiBeforeTyping;
    await p.keyboard.press('Enter');
    await p.waitForSelector('.video-row:not(.video-row--skeleton)', { timeout: 30000 });
    await p.click('.video-row >> nth=0');
    await p.waitForTimeout(1500);
    const navs = MODE === 'car' ? [] : ['a[href="/"]', 'a[href="/library"]', 'a[href="/history"]', 'a[href="/search"]', 'a[href="/"]'];
    for (const s of navs) { await p.click(s); await p.waitForTimeout(600); }
    if (process.env.PROFILE === 'all') { const { profile } = await cdp.send('Profiler.stop'); dump(profile, 'ALL'); }
    const v1 = await p.evaluate(() => ({ ...window.__v, heap: performance.memory?.usedJSHeapSize }));
    if (process.env.SHIFTS) console.log('shifts', JSON.stringify(v0.shifts));
    if (process.env.SLOW) console.log('slow events', JSON.stringify((await p.evaluate(() => window.__v.slow)) || []));
    results.push({ fcp: Math.round(fcp), lcp: Math.round(v0.lcp), cls: +v0.cls.toFixed(3), startupTBT, startupLongest, inp: Math.round(v1.inp), jsKB: Math.round(jsBytes / 1024), requests: reqs, apiAtStartup: apiBeforeTyping, apiDuringTyping: apiTyping, commitsStartup: v0.commits, playerInitMs: v1.playerReady && v1.playerInit ? Math.round(v1.playerReady - v1.playerInit) : null, heapMB: +(v1.heap / 1048576).toFixed(1) });
    await ctx.close();
  }
  const med = (k) => { const a = results.map((r) => r[k]).filter((x) => x != null).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  const out = { mode: MODE, runs: N };
  for (const k of Object.keys(results[0])) out[k] = med(k);
  console.log(JSON.stringify(out));
  await b.close();
})();
