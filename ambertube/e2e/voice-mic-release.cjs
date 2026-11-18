// Voice search microphone lifecycle: music is paused before listening and stays paused, the recognition
// session is always ended (abort) on every exit path, stale callbacks are ignored, and the page's audio
// session is handed back to "media playback" afterwards (navigator.audioSession, where supported).
// Real CarPlay routing can only be verified on an iPhone; this checks the web-side contract.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  let fails = 0;
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fails++; };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    window.__log = []; window.__recs = [];
    navigator.audioSession = { _t: 'auto', get type() { return this._t; }, set type(v) { this._t = v; window.__log.push('session:' + v); } };
    class FakeRec {
      constructor() { this.active = false; window.__recs.push(this); }
      start() { this.active = true; window.__log.push('start'); setTimeout(() => this.onstart && this.onstart(), 10); }
      stop() { window.__log.push('stop'); }
      abort() { if (this.active) window.__log.push('abort'); this.active = false; }
      // test helpers
      say(text, final) { this.onresult && this.onresult({ results: Object.assign([Object.assign([{ transcript: text }], { isFinal: final })], {}) }); }
      fail(code) { this.onerror && this.onerror({ error: code }); this.onend && this.onend(); }
    }
    window.SpeechRecognition = FakeRec; delete window.webkitSpeechRecognition;
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto((process.env.AMBERTUBE_URL || 'http://localhost:4173') + '/search?q=sunset');
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
  await p.click('.video-row >> nth=0'); await p.waitForTimeout(800);
  const playing = async () => (await p.getAttribute('.play-btn', 'aria-label')) === 'Tạm dừng';
  check('music is playing before voice search', await playing());
  const time0 = await p.textContent('.player__title');

  // 1) success
  await p.click('.searchbar__mic'); await p.waitForTimeout(100);
  check('music pauses as voice search starts', !(await playing()));
  await p.evaluate(() => window.__recs.at(-1).say('lofi', false)); await p.evaluate(() => window.__recs.at(-1).say('lofi chill', true));
  await p.waitForTimeout(200);
  let st = await p.evaluate(() => ({ log: window.__log.join(','), active: window.__recs.at(-1).active, handlers: !!window.__recs.at(-1).onresult, session: navigator.audioSession.type }));
  check('success: recognition ended (mic released) and handlers detached', !st.active && !st.handlers && /abort/.test(st.log), st.log);
  check('success: audio session handed back to playback → auto', /session:playback,session:auto$/.test(st.log) && st.session === 'auto', st.log);
  check('success: transcript in the search box', (await p.inputValue('.searchbar__input')) === 'lofi chill');
  check('music stays paused after recognition', !(await playing()));
  await p.waitForTimeout(3000);
  check('no autoplay / auto-resume afterwards', !(await playing()) && (await p.textContent('.player__title')) === time0);

  // 2) error (permission denied)
  await p.evaluate(() => (window.__log = []));
  await p.click('.searchbar__mic'); await p.waitForTimeout(80);
  await p.evaluate(() => window.__recs.at(-1).fail('not-allowed')); await p.waitForTimeout(150);
  st = await p.evaluate(() => ({ log: window.__log.join(','), active: window.__recs.at(-1).active }));
  check('permission denied: mic released + session restored', !st.active && /session:auto$/.test(st.log), st.log);
  check('permission denied: message shown', /micro/.test(await p.textContent('.toast-stack')));

  // 3) user cancel (tap mic again) → stop, then forced abort after the grace period
  await p.evaluate(() => (window.__log = []));
  await p.click('.searchbar__mic'); await p.waitForTimeout(80);
  await p.click('.searchbar__mic'); await p.waitForTimeout(1800);
  st = await p.evaluate(() => ({ log: window.__log.join(','), active: window.__recs.at(-1).active }));
  check('cancel: stop() then abort() if the engine never ends', /stop.*abort/.test(st.log) && !st.active, st.log);

  // 4) stale callbacks: an event already in flight from an ended session must not change anything
  await p.fill('.searchbar__input', '');
  await p.click('.searchbar__mic'); await p.waitForTimeout(60);
  await p.evaluate(() => { const r = window.__recs.at(-1); window.__staleResult = r.onresult; window.__staleError = r.onerror; });
  await p.click('.searchbar__mic'); await p.waitForTimeout(1700); // cancel → session A ends
  await p.click('.searchbar__mic'); await p.waitForTimeout(60);   // session B
  await p.evaluate(() => { window.__staleResult({ results: [Object.assign([{ transcript: 'stale text' }], { isFinal: true })] }); window.__staleError({ error: 'network' }); });
  await p.waitForTimeout(100);
  check('stale callbacks from an old session are ignored', (await p.inputValue('.searchbar__input')) !== 'stale text' && (await p.evaluate(() => window.__recs.at(-1).active)), await p.inputValue('.searchbar__input'));
  check('only one session active at a time', (await p.evaluate(() => window.__recs.filter((r) => r.active).length)) === 1);

  // 5) timeout: nothing heard for 12 s → released (session B is still listening)
  await p.evaluate(() => (window.__log = []));
  await p.waitForTimeout(12300);
  st = await p.evaluate(() => ({ log: window.__log.join(','), active: window.__recs.some((r) => r.active) }));
  check('timeout: mic released after 12 s', !st.active && /abort,session:playback,session:auto/.test(st.log), st.log);

  // 6) navigation away while listening
  await p.click('.searchbar__mic'); await p.waitForTimeout(60);
  await p.click('a[href="/library"]'); await p.waitForTimeout(200);
  check('navigating away releases the mic', !(await p.evaluate(() => window.__recs.some((r) => r.active))));

  // 7) page hidden (screen lock) while listening
  await p.click('.searchbar__mic'); await p.waitForTimeout(60);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(100);
  check('page hidden releases the mic', !(await p.evaluate(() => window.__recs.some((r) => r.active))));
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => false, configurable: true }); });

  // explicit Play resumes the same song
  await p.click('.play-btn'); await p.waitForTimeout(400);
  check('Play resumes the same track', await playing() && (await p.textContent('.player__title')) === time0);
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  await b.close();
})();
