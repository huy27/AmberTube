// Car View voice search: full-screen listening view, results the user taps to play (no auto-play), big "Nói lại" /
// "Tiếp tục nhạc" buttons, big mic buttons in the car player bar and Now Playing, no on-screen keyboard.
// Runs on the demo build (http://localhost:4173); the Web Speech API is faked.
const { chromium } = require('playwright');
const URL0 = process.env.AMBERTUBE_URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch();
  let fails = 0;
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fails++; };
  async function car(viewport, speech = true) {
    const ctx = await b.newContext({ viewport, hasTouch: true });
    await ctx.addInitScript((sp) => {
      localStorage.setItem('ambertube:display-mode', 'car'); localStorage.setItem('ambertube:car-suggest-dismissed', '1');
      window.__recs = [];
      if (sp) {
        window.SpeechRecognition = class {
          constructor() { this.active = false; window.__recs.push(this); }
          start() { this.active = true; setTimeout(() => this.onstart && this.onstart(), 10); }
          stop() { /* real browsers may never deliver a final result after stop() */ }
          abort() { this.active = false; }
          say(text, final) { this.onresult && this.onresult({ results: [Object.assign([{ transcript: text }], { isFinal: final })] }); }
          fail(code) { this.onerror && this.onerror({ error: code }); this.onend && this.onend(); }
        };
      } else { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; }
    }, speech);
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
    return { ctx, p, errs };
  }
  const rec = (p) => p.evaluate(() => { const r = window.__recs.at(-1); return r ? { active: r.active } : null; });
  const say = (p, t, f) => p.evaluate(([t, f]) => window.__recs.at(-1).say(t, f), [t, f]);
  const playing = (p) => p.evaluate(() => document.querySelector('.cbtn--play')?.getAttribute('aria-label') === 'Tạm dừng');
  const title = (p) => p.textContent('.cplayer__title');
  const startSong = async (p) => {
    await p.goto(URL0 + '/search?q=acoustic'); await p.waitForSelector('.video-row:not(.video-row--skeleton)');
    await p.click('.video-row >> nth=0'); await p.waitForTimeout(600);
  };

  for (const vp of [{ width: 800, height: 480 }, { width: 1024, height: 600 }]) {
    const tag = `${vp.width}×${vp.height}`;
    const { ctx, p, errs } = await car(vp);
    await startSong(p);
    const song0 = await title(p);
    // 1. big mic in the car player bar → full-screen listening view
    const micBox = await p.$eval('.cbtn--mic', (e) => e.getBoundingClientRect());
    check(`${tag}: big mic button in the car player bar (≥ 48 px)`, micBox.width >= 48 && micBox.height >= 48, JSON.stringify(micBox));
    await p.click('.cbtn--mic'); await p.waitForSelector('.cvoice--listening');
    const cover = await p.$eval('.cvoice', (e) => { const r = e.getBoundingClientRect(); return r.width === innerWidth && r.height === innerHeight; });
    check(`${tag}: listening view covers the screen, music paused, mic on`, cover && !(await playing(p)) && (await rec(p)).active);
    check(`${tag}: no text box focused (no on-screen keyboard)`, await p.evaluate(() => !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)));
    await say(p, 'sun', false); await p.waitForTimeout(100);
    check(`${tag}: words appear in big text while speaking`, (await p.textContent('.cvoice__heard')) === 'sun');
    const fontPx = await p.$eval('.cvoice__heard', (e) => parseFloat(getComputedStyle(e).fontSize));
    check(`${tag}: text is large (≥ 22 px)`, fontPx >= 22, `${fontPx}px`);
    // 2. final result → results; the paused song carries on, tapping the top card plays it
    await say(p, 'sunset', true);
    await p.waitForSelector('.cvoice--results', { timeout: 5000 });
    const top = await p.textContent('.cvoice__top strong');
    check(`${tag}: results: best match first, no auto-play countdown`, top.length > 0 && !(await p.$('.cvoice__count')) && /Chọn bài để phát/.test(await p.textContent('.cvoice__bar')));
    check(`${tag}: mic released once a result arrived`, !(await rec(p)).active);
    const over = await p.evaluate(() => document.querySelector('.cvoice').scrollWidth > innerWidth);
    const small = await p.$$eval('.cvoice button', (bs) => bs.filter((x) => x.offsetParent && x.getBoundingClientRect().height < 44).map((x) => x.textContent || x.getAttribute('aria-label')));
    check(`${tag}: results fit (no sideways overflow), every button ≥ 44 px tall`, !over && small.length === 0, small.join(','));
    await p.screenshot({ path: `/tmp/car-voice-results-${vp.width}.png` });
    await p.waitForTimeout(3600);
    check(`${tag}: results shown → the song that was playing continues (nothing new starts)`, Boolean(await p.$('.cvoice--results')) && await playing(p) && (await title(p)) === song0, await title(p));
    await p.click('.cvoice__top'); await p.waitForTimeout(400);
    check(`${tag}: tap the best match → it plays and the view closes`, !(await p.$('.cvoice')) && (await title(p)) === top && await playing(p), await title(p));
    // 3. cancel → "Tiếp tục nhạc" resumes the same song
    const song1 = await title(p);
    await p.click('.cbtn--mic'); await p.waitForSelector('.cvoice--listening');
    await p.click('.cvoice__listen button:has-text("Hủy")');
    await p.waitForSelector('.cvoice--problem');
    check(`${tag}: cancel → "Đã hủy" with big "Nói lại" and "Tiếp tục nhạc"; music stays paused`, /Đã hủy/.test(await p.textContent('.cvoice')) && await p.isVisible('button:has-text("Nói lại")') && await p.isVisible('button:has-text("Tiếp tục nhạc")') && !(await playing(p)) && !(await rec(p)).active);
    await p.click('button:has-text("Tiếp tục nhạc")'); await p.waitForTimeout(400);
    check(`${tag}: "Tiếp tục nhạc" resumes the same song`, !(await p.$('.cvoice')) && await playing(p) && (await title(p)) === song1);
    // 4. nothing heard → "Nói lại" listens again
    await p.click('.cbtn--mic'); await p.waitForSelector('.cvoice--listening');
    await p.evaluate(() => window.__recs.at(-1).fail('no-speech')); await p.waitForSelector('.cvoice--problem');
    check(`${tag}: not heard → "Chưa nghe rõ"`, /Chưa nghe rõ/.test(await p.textContent('.cvoice__heard')));
    await p.click('button:has-text("Nói lại")'); await p.waitForSelector('.cvoice--listening');
    check(`${tag}: "Nói lại" listens again`, (await rec(p)).active);
    // 5. tap the screen when done talking → searches what was heard
    await say(p, 'acoustic', false);
    await p.click('.cvoice__heard');
    await p.waitForSelector('.cvoice--results', { timeout: 6000 });
    check(`${tag}: tap when done → searches what was heard`, /acoustic/.test(await p.textContent('.cvoice__q')));
    await p.waitForTimeout(400);
    check(`${tag}: results → mic released, the paused song continues`, !(await rec(p)).active && await playing(p) && (await title(p)) === song1, await title(p));
    // 6. tapping another result plays it
    const second = await p.textContent('.cvoice__item >> nth=0 >> strong');
    await p.click('.cvoice__item >> nth=0'); await p.waitForTimeout(400);
    check(`${tag}: tap another result → it plays`, (await title(p)) === second && await playing(p));
    // 7. Now Playing + search-bar mic open the same view
    await p.click('.cplayer__now'); await p.waitForSelector('.np');
    await p.click('.np__voice'); await p.waitForSelector('.cvoice--listening');
    check(`${tag}: the mic on Now Playing opens it`, true);
    await p.click('.cvoice__close'); await p.waitForTimeout(200);
    check(`${tag}: close (×) releases the mic`, !(await p.$('.cvoice')) && !(await rec(p)).active);
    await p.click('.np button[aria-label="Quay lại"]'); await p.waitForTimeout(300);
    await p.click('.searchbar__mic'); await p.waitForSelector('.cvoice--listening', { timeout: 3000 }).catch(() => {});
    check(`${tag}: the search-bar mic opens the full-screen view too`, Boolean(await p.$('.cvoice--listening')));
    await p.click('.cvoice__close');
    check(`${tag}: no page errors`, errs.length === 0, errs.join(' | '));
    void song0;
    await ctx.close();
  }
  // browsers without speech recognition: the mic opens the typing box, music keeps playing
  {
    const { ctx, p } = await car({ width: 800, height: 480 }, false);
    await startSong(p);
    await p.click('.cbtn--mic'); await p.waitForTimeout(300);
    check('no speech support: mic → typing box focused, music keeps playing, no overlay', await p.evaluate(() => document.activeElement?.classList.contains('searchbar__input')) && await playing(p) && !(await p.$('.cvoice')));
    await p.click('.cplayer__now'); await p.waitForSelector('.np');
    await p.click('.np__voice'); await p.waitForTimeout(400);
    check('no speech support: mic on Now Playing → closes it, typing box focused, music keeps playing', !(await p.$('.np')) && await p.evaluate(() => document.activeElement?.classList.contains('searchbar__input')) && await playing(p));
    await ctx.close();
  }
  // desktop keeps the inline voice search
  {
    const ctx = await b.newContext({ viewport: { width: 1360, height: 860 } });
    await ctx.addInitScript(() => { localStorage.setItem('ambertube:display-mode', 'desktop'); window.SpeechRecognition = class { start() { this.active = true; setTimeout(() => this.onstart && this.onstart(), 10); } stop() {} abort() {} }; });
    const p = await ctx.newPage(); await p.goto(URL0 + '/');
    await p.click('.searchbar__mic'); await p.waitForTimeout(200);
    check('desktop: unchanged inline voice search (no full-screen view)', !(await p.$('.cvoice')) && Boolean(await p.$('.searchbar.is-listening')));
    await ctx.close();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  await b.close();
})();
