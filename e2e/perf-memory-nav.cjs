// Repeated navigation while music plays: heap (after GC), window/document listeners and DOM node count
// must not grow without bound. Uses the demo build on :4173.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const mode = process.argv[2] || 'desktop';
  const p = await b.newPage({ viewport: mode === 'car' ? { width: 1024, height: 600 } : { width: 1360, height: 860 } });
  await p.addInitScript((m) => localStorage.setItem('ambertube:display-mode', m), mode);
  const cdp = await p.context().newCDPSession(p);
  await p.goto((process.env.AMBERTUBE_URL || 'http://localhost:4173') + '/search?q=sunset');
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
  await p.click('.video-row >> nth=0');
  const snap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    const listeners = async (expr) => { const { result } = await cdp.send('Runtime.evaluate', { expression: expr }); return (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners.length; };
    const q = await p.evaluate(() => JSON.parse(localStorage.getItem('ambertube:player:v1') || '{}').queue?.length || 0);
    const hist = await p.evaluate(() => JSON.parse(localStorage.getItem('ambertube:v1') || '{}').history?.length || 0);
    return { queue: q, history: hist, heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(2), nodes: m.Nodes, windowListeners: await listeners('window'), docListeners: await listeners('document') };
  };
  await cdp.send('Performance.enable');
  const routes = ['/', '/library', '/history', '/playlists', '/settings', '/search?q=lofi', '/downloads', '/'];
  const go = async (r) => { await p.evaluate((r) => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')); }, r); await p.waitForTimeout(120); };
  for (const r of routes) await go(r); // warm-up: every lazy page loaded once
  const a = await snap();
  for (let i = 0; i < 25; i++) for (const r of routes) await go(r);
  const mid = await snap();
  for (let i = 0; i < 25; i++) for (const r of routes) await go(r);
  // panels and Now Playing too
  for (let i = 0; i < 20; i++) { await p.keyboard.press('q'); await p.waitForTimeout(60); await p.keyboard.press('q'); await p.waitForTimeout(60); }
  const c = await snap();
  console.log(JSON.stringify({ mode, navigations: 50 * routes.length, before: a, mid, after: c }));
  // growth must flatten out (second half grows far less than a leak would)
  const ok = c.heapMB - mid.heapMB < 1.5 && c.heapMB - a.heapMB < 3 && c.windowListeners <= a.windowListeners + 2 && c.docListeners <= a.docListeners + 2 && c.nodes < a.nodes * 1.5;
  console.log(ok ? 'ALL PASSED' : 'FAILED: possible leak');
  await b.close();
})();
