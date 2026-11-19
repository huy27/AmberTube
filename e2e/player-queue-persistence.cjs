const { chromium } = require('playwright');
const BASE = process.env.AMBERTUBE_URL || 'http://localhost:4173';
let fails = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!cond) fails++; };
const timeOf = async (p) => (await p.textContent('.player__time')).split('/')[0].trim();
const secs = (s) => s.split(':').reduce((a, b) => a * 60 + Number(b), 0);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1360, height: 880 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(BASE + '/search?q=' + encodeURIComponent('Lo-fi Hip Hop Beats'));
  // this suite checks the manual queue; Smart Autoplay is covered by smart-autoplay.cjs
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ambertube:smart-autoplay', JSON.stringify({ enabled: false, mode: 'balanced' })); });
  await p.reload();
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
  const titles = await p.$$eval('.video-row__title', (els) => els.map((e) => e.textContent));

  // --- playback basics (a search result plays only that song; the rest are queued by hand)
  await p.click('.video-row >> nth=0');
  for (let i = 1; i < titles.length; i++) await p.click(`.video-row >> nth=${i} >> .video-row__queue`);
  await p.waitForTimeout(2000);
  const t1 = secs(await timeOf(p));
  check('click row starts playback', (await p.getAttribute('.play-btn', 'aria-label')) === 'Tạm dừng' && t1 >= 1, `t=${t1}`);

  // --- speed
  const speedLabels = async () => { await p.click('.speed .popover__trigger'); const l = await p.$$eval('.speed .popover__item', (e) => e.map((x) => x.textContent)); return l; };
  const labels = await speedLabels();
  check('speed menu lists 6 speeds', labels.length === 6, labels.join(' | '));
  await p.click('.speed .popover__item:has-text("2.0x")');
  check('speed label shows 2.0x', (await p.textContent('.speed__value')) === '2.0x');
  const a = secs(await timeOf(p)); await p.waitForTimeout(3000); const bT = secs(await timeOf(p));
  check('2.0x advances ~2s per second', bT - a >= 5 && bT - a <= 7, `Δ=${bT - a}s in 3s`);
  await p.click('.speed .popover__trigger'); await p.click('.speed .popover__item:has-text("Bình thường")');

  // --- queue panel
  await p.keyboard.press('q');
  await p.waitForTimeout(300);
  check('Q opens queue panel', await p.isVisible('.queue.is-open'));
  const qTitles = async () => p.$$eval('.queue .queue__title', (e) => e.map((x) => x.textContent));
  let q = await qTitles();
  check('queue holds the search results', q.length === titles.length, `${q.length} items`);
  check('current track marked', (await p.textContent('.queue__item.is-current .queue__title')) === titles[0]);

  // play next via More menu on row 4
  await p.click('.video-row >> nth=3 >> .more__btn');
  await p.click('.menu >> text=Phát tiếp theo');
  q = await qTitles();
  check('Play next inserts after current', q[1] === titles[3], q[1]);

  // remove
  const toRemove = q[2];
  await p.hover('.queue__item >> nth=2');
  await p.click('.queue__item >> nth=2 >> .queue__remove');
  q = await qTitles();
  check('remove from queue', !q.includes(toRemove) && q.length === titles.length - 1);

  // drag & drop: move item 1 to the end
  const moved = q[1];
  await p.dragAndDrop('.queue__item >> nth=1', '.queue__item >> nth=-1', { targetPosition: { x: 50, y: 40 } });
  q = await qTitles();
  check('drag & drop reorders', q[q.length - 1] === moved, `last=${q[q.length - 1]}`);

  // keyboard reorder
  const second = q[1];
  await p.focus('.queue__item >> nth=1 >> .queue__main');
  await p.keyboard.press('Alt+ArrowDown');
  q = await qTitles();
  check('Alt+↓ reorders with keyboard', q[2] === second);

  // --- skip unavailable: queue the unavailable track next, then press Next
  const unavailIdx = titles.findIndex((t) => t.includes('Rainy Platform'));
  await p.click(`.video-row >> nth=${unavailIdx} >> .more__btn`);
  await p.click('.menu >> text=Phát tiếp theo');
  const afterUnavailable = (await qTitles())[2];
  await p.click('button[aria-label^="Bài tiếp theo"]');
  await p.waitForTimeout(1600);
  const toastTxt = await p.textContent('.toast-stack');
  const nowPlaying = await p.textContent('.player__title');
  check('known-unavailable video is skipped by Next', nowPlaying === afterUnavailable, nowPlaying);
  // clicking it directly: the provider reports an error. Autoplay is off in this suite and a search
  // result plays on its own, so there is nothing to skip to — the message must say so clearly.
  await p.click(`.video-row >> nth=${unavailIdx}`);
  await p.waitForTimeout(1500);
  const toast2 = await p.textContent('.toast-stack');
  const now2 = await p.textContent('.player__title');
  check('playback error shows a message', /không khả dụng/i.test(toast2), toast2.slice(0, 90));
  check('failed track flagged in queue + results', (await p.$$('.queue__item.is-failed')).length >= 1 && (await p.$$('.video-row.is-failed')).length === 1);
  await p.click('.video-row >> nth=0');
  await p.click('.video-row >> nth=1 >> .video-row__queue');
  await p.waitForTimeout(600);
  const nowPlaying2 = await p.textContent('.player__title'); void now2;

  // --- clear queue
  await p.click('.queue__tools >> text=Xóa hết');
  q = await qTitles();
  check('Clear keeps only current track', q.length === 1 && q[0] === nowPlaying2, q.join(' | '));

  // add to queue
  await p.click('.video-row >> nth=1 >> .more__btn');
  await p.click('.menu >> text=Thêm vào hàng đợi');
  check('Add to queue appends', (await qTitles()).length === 2);

  // --- auto-advance at end of track (seek near end of a short track) — needs "Tự động phát" on
  // (one switch since 2026-11: off = stop at the end of the song; covered in autoplay-advance.cjs)
  await p.goto(BASE + '/search?q=ambient');
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
  await p.click('.video-row >> nth=0');
  await p.click('.video-row >> nth=1 >> .video-row__queue');
  await p.waitForTimeout(500);
  await p.keyboard.press('q');
  if ((await p.getAttribute('.player__autoplay', 'aria-label')).startsWith('Tự động phát: tắt')) await p.click('.player__autoplay');
  const firstTitle = await p.textContent('.player__title');
  await p.$eval('.progress--top .progress__input', (el) => { el.focus(); });
  await p.evaluate(() => {
    const el = document.querySelector('.progress--top .progress__input');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, String(Number(el.max) - 1)); el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await p.waitForTimeout(2000);
  const second2 = await p.textContent('.player__title');
  check('auto-plays next track when one ends', second2 !== firstTitle && (await p.getAttribute('.play-btn', 'aria-label')) === 'Tạm dừng', `${firstTitle} → ${second2}`);

  // --- persistence: set prefs then reload
  await p.click('.speed .popover__trigger'); await p.click('.speed .popover__item:has-text("1.5x")');
  await p.keyboard.press('Escape');
  await p.click('body'); // drop focus from inputs
  await p.keyboard.press('s');
  await p.keyboard.press('r');
  for (let i = 0; i < 4; i++) await p.keyboard.press('ArrowDown');
  await p.waitForTimeout(1500);
  const before = { title: await p.textContent('.player__title'), time: secs(await timeOf(p)), vol: await p.inputValue('.slider'), qlen: (await qTitles()).length };
  await p.waitForTimeout(400);
  await p.reload();
  await p.waitForSelector('.player__title');
  const after = { title: await p.textContent('.player__title'), time: secs(await timeOf(p)), vol: await p.inputValue('.slider'), speed: await p.textContent('.speed__value') };
  check('last played track restored', after.title === before.title, after.title);
  check('playback position restored', Math.abs(after.time - before.time) <= 2, `${before.time}s → ${after.time}s`);
  check('volume restored', after.vol === before.vol && before.vol === '50', `vol ${before.vol} → ${after.vol}`);
  check('speed restored', after.speed === '1.5x');
  check('shuffle restored', (await p.getAttribute('button[aria-label^="Trộn bài"]', 'aria-pressed')) === 'true');
  check('repeat restored', (await p.getAttribute('button[aria-label^="Lặp lại"]', 'aria-label')).includes('tất cả'));
  await p.keyboard.press('q');
  check('queue restored', (await qTitles()).length === before.qlen, `${(await qTitles()).length} items`);
  check('restored state starts paused', (await p.getAttribute('.play-btn', 'aria-label')) === 'Phát');
  await p.click('.play-btn');
  await p.waitForTimeout(1200);
  check('resumes from saved position', secs(await timeOf(p)) >= before.time, await timeOf(p));

  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
})();
