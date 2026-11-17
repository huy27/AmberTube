const { chromium } = require('playwright');
const BASE = process.env.AMBERTUBE_URL || 'http://localhost:4173';
let fails = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!cond) fails++; };

// Fake Web Speech API controlled from the test
const MOCK = () => {
  window.__rec = null;
  class FakeRec {
    constructor() { this.lang = ''; this.onstart = this.onresult = this.onerror = this.onend = null; window.__rec = this; }
    start() { setTimeout(() => this.onstart && this.onstart(), 10); }
    stop() { setTimeout(() => this.onend && this.onend(), 10); }
    abort() { this.onend && this.onend(); }
  }
  window.SpeechRecognition = FakeRec;
  window.__say = (text, final) => {
    const r = window.__rec;
    const res = [{ 0: { transcript: text, confidence: 0.9 }, length: 1, isFinal: final }];
    r.onresult({ resultIndex: 0, results: Object.assign(res, { length: 1 }) });
    if (final) r.onend();
  };
  window.__fail = (code) => { const r = window.__rec; r.onerror({ error: code }); r.onend(); };
};

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1360, height: 880 } });
  await ctx.addInitScript(MOCK);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(BASE + '/');
  await p.evaluate(() => localStorage.clear());
  await p.reload();

  // ---------- Voice search ----------
  check('mic button in search bar', await p.isVisible('.searchbar .searchbar__mic'));
  check('default language VI', (await p.textContent('.searchbar__lang')) === 'VI');
  await p.click('.searchbar__mic');
  await p.waitForTimeout(100);
  check('listening state + animation', await p.isVisible('.searchbar.is-listening .mic-rings'));
  check('recognizer uses vi-VN', (await p.evaluate(() => window.__rec.lang)) === 'vi-VN');
  check('listening placeholder', (await p.getAttribute('.searchbar__input', 'placeholder')).startsWith('Đang nghe'));
  await p.evaluate(() => window.__say('nhạc lo', false));
  check('interim text shown while speaking', (await p.inputValue('.searchbar__input')) === 'nhạc lo');
  await p.evaluate(() => window.__say('nhạc lofi chill', true));
  await p.waitForTimeout(100);
  check('final text placed in search box', (await p.inputValue('.searchbar__input')) === 'nhạc lofi chill');
  check('does not auto-search (user can edit)', new URL(p.url()).pathname === '/' && await p.isVisible('.searchbar__hint'));
  check('search box focused for editing', await p.evaluate(() => document.activeElement.classList.contains('searchbar__input')));
  await p.keyboard.type(' mix');
  await p.keyboard.press('Enter');
  await p.waitForURL(/\/search/);
  check('Enter searches edited text', decodeURIComponent(new URL(p.url()).searchParams.get('q')) === 'nhạc lofi chill mix');

  await p.click('.searchbar__lang');
  check('language toggles to EN', (await p.textContent('.searchbar__lang')) === 'EN');
  await p.click('.searchbar__mic');
  await p.waitForTimeout(50);
  check('recognizer uses en-US', (await p.evaluate(() => window.__rec.lang)) === 'en-US');
  await p.evaluate(() => window.__fail('not-allowed'));
  await p.waitForTimeout(100);
  check('permission error explained', /Quyền truy cập micro/.test(await p.textContent('.toast-stack')));
  check('listening stops after error', !(await p.isVisible('.searchbar.is-listening')));
  await p.click('.searchbar__mic');
  await p.waitForTimeout(50);
  await p.evaluate(() => window.__fail('no-speech'));
  await p.waitForTimeout(100);
  check('no-speech error explained', /Chưa nghe rõ/.test(await p.textContent('.toast-stack')));

  // unsupported browser fallback
  const p2 = await b.newPage();
  await p2.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined }); });
  await p2.goto(BASE + '/');
  check('unsupported: mic shown as unavailable', await p2.isVisible('.searchbar__mic.is-unsupported'));
  await p2.click('.searchbar__mic');
  check('unsupported: explains + falls back to typing', /không hỗ trợ/.test(await p2.textContent('.toast-stack')) && await p2.evaluate(() => document.activeElement.classList.contains('searchbar__input')));
  await p2.fill('.searchbar__input', 'ambient');
  await p2.keyboard.press('Enter');
  await p2.waitForSelector('.video-row:not(.video-row--skeleton)');
  check('unsupported: text search still works', (await p2.$$('.video-row')).length > 0);
  await p2.close();

  // ---------- Lyrics ----------
  await p.goto(BASE + '/search?q=sunset');
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
  await p.click('.video-row >> nth=0'); // Sunset Groove (synced demo lyrics)
  await p.keyboard.press('l');
  await p.waitForSelector('.lyrics .lyric');
  check('lyrics panel opens with L', await p.isVisible('.lyrics.is-open'));
  check('synced badge shown', /Đồng bộ/.test(await p.textContent('.lyrics .queue__count')));
  // seek to 0:41 by clicking a lyric line
  await p.click('.lyrics .lyric:has-text("Hold on to the sunset groove") >> nth=0');
  await p.waitForTimeout(800);
  check('clicking a line seeks there', (await p.textContent('.player__time')).startsWith('0:4'), await p.textContent('.player__time'));
  check('current line highlighted', (await p.textContent('.lyric.is-active')) === 'Hold on to the sunset groove');
  await p.waitForTimeout(6500);
  check('highlight follows playback', (await p.textContent('.lyric.is-active')) === "Slow it down, there's nothing left to prove", await p.textContent('.lyric.is-active'));
  await p.waitForTimeout(600);
  const off = await p.$eval('.lyrics__lines', (el) => { const a = el.querySelector('.lyric.is-active').getBoundingClientRect(); const r = el.getBoundingClientRect(); return Math.round((a.top + a.height / 2) - (r.top + r.height / 2)); });
  check('auto-scrolls current line to the middle', Math.abs(off) < 40, `offset from centre ${off}px`);
  // manual scroll pauses follow
  await p.hover('.lyrics__lines');
  await p.mouse.wheel(0, -400);
  await p.waitForTimeout(400);
  check('manual scroll shows “Back to current line”', await p.isVisible('.lyrics__follow'));
  await p.click('.lyrics__follow');
  check('back to current line resumes', !(await p.isVisible('.lyrics__follow')));

  // plain lyrics
  await p.goto(BASE + '/search?q=letters');
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
  await p.click('.video-row >> nth=0');
  await p.keyboard.press('l');
  await p.waitForTimeout(400);
  check('unsynced lyrics displayed as text', (await p.$$('.lyric--plain')).length > 5 && /Không đồng bộ/.test(await p.textContent('.lyrics .queue__count')));

  // instrumental
  await p.goto(BASE + '/search?q=rain');
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
  await p.click('.video-row >> nth=0');
  await p.keyboard.press('l');
  await p.waitForTimeout(400);
  check('instrumental message', /Nhạc không lời/.test(await p.textContent('.lyrics')));

  // unavailable + import
  await p.goto(BASE + '/search?q=paper%20lanterns');
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
  await p.click('.video-row:has-text("Paper Lanterns")');
  await p.keyboard.press('l');
  await p.waitForTimeout(400);
  check('fallback when lyrics unavailable', /Chưa có lời/.test(await p.textContent('.lyrics')));
  await p.setInputFiles('.lyrics input[type=file]', require('path').join(require('./fixtures.cjs').dir, 'my-song.lrc'));
  await p.waitForSelector('.lyrics .lyric:has-text("First imported line")');
  check('imported .lrc shown as synced', /Đồng bộ · Bạn đã nhập/.test(await p.textContent('.lyrics .queue__count')));

  // ---------- Visualizer ----------
  check('YouTube/demo uses decorative animation', (await p.getAttribute('.visualizer canvas', 'data-source')) === 'decorative');
  const cls1 = await p.getAttribute('.visualizer', 'class');
  await p.click('.visualizer');
  const cls2 = await p.getAttribute('.visualizer', 'class');
  check('visualizer toggles waveform/spectrum', cls1.includes('wave') && cls2.includes('spectrum'), `${cls1} → ${cls2}`);
  const painted = await p.$eval('.visualizer canvas', (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  check('visualizer draws', painted > 200, `${painted} px`);

  // local file → real analysis
  await p.goto(BASE + '/library');
  await p.setInputFiles('input[type=file][accept="audio/*"]', require('path').join(require('./fixtures.cjs').dir, 'Test Tone Song.wav'));
  await p.waitForSelector('.video-row:has-text("Test Tone Song")');
  await p.click('.video-row:has-text("Test Tone Song")');
  await p.waitForTimeout(1500);
  check('local file plays', (await p.getAttribute('.play-btn', 'aria-label')) === 'Tạm dừng' && /0:0[1-9]/.test(await p.textContent('.player__time')), await p.textContent('.player__time'));
  check('local file uses real audio analysis', (await p.getAttribute('.visualizer canvas', 'data-source')) === 'analyser');
  const energy = await p.evaluate(() => new Promise((res) => setTimeout(() => {
    const c = document.querySelector('.visualizer canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; res(n);
  }, 300)));
  check('spectrum reflects real audio', energy > 200, `${energy} px`);
  await p.click('.speed .popover__trigger');
  check('local audio offers all speeds', (await p.$$('.speed .popover__item')).length === 6);
  await p.keyboard.press('Escape');

  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
})();
