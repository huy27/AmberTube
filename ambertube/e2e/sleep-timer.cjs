const { chromium } = require('playwright');
const BASE = process.env.AMBERTUBE_URL || 'http://localhost:4173';
let fails = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!cond) fails++; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1360, height: 880 } });
  await p.clock.install();
  await p.goto(BASE + '/search?q=deep%20focus');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.clock.runFor(1000);
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
  await p.click('.video-row >> nth=0'); // Deep Focus 1h
  await p.clock.runFor(1000);
  check('playing', (await p.getAttribute('.play-btn', 'aria-label')) === 'Tạm dừng');

  await p.click('.sleep .popover__trigger');
  const opts = await p.$$eval('.sleep .popover__item', (e) => e.map((x) => x.textContent));
  check('sleep options', opts.join('|') === '15 phút|30 phút|45 phút|60 phút|Hết bài hiện tại', opts.join('|'));
  await p.click('.sleep .popover__item:has-text("15 phút")');
  await p.clock.runFor(2000);
  const badge = await p.textContent('.sleep__badge');
  check('remaining time shown', /^14:5\d$/.test(badge), badge);

  // cancel
  await p.click('.sleep .popover__trigger');
  check('status inside menu', /Tạm dừng sau 14:5\d/.test(await p.textContent('.sleep__status')));
  await p.click('.sleep__status >> text=Hủy hẹn giờ');
  check('cancel removes badge', (await p.$('.sleep__badge')) === null);

  // set 15 again and let it expire
  await p.click('.sleep .popover__trigger');
  await p.click('.sleep .popover__item:has-text("15 phút")');
  await p.clock.fastForward(14 * 60_000); await p.clock.runFor(500);
  check('still playing at 14 min', (await p.getAttribute('.play-btn', 'aria-label')) === 'Tạm dừng', await p.textContent('.sleep__badge'));
  await p.clock.fastForward(61_000); await p.clock.runFor(500);
  check('paused when timer expires', (await p.getAttribute('.play-btn', 'aria-label')) === 'Phát');
  check('expiry message', /Hết giờ hẹn/.test(await p.textContent('.toast-stack')));
  check('timer cleared', (await p.$('.sleep__badge')) === null);

  // end of current track
  await p.goto(BASE + '/search?q=ambient');
  await p.clock.runFor(1000);
  await p.click('.video-row >> nth=0');
  await p.clock.runFor(1000);
  await p.click('.sleep .popover__trigger');
  await p.click('.sleep .popover__item:has-text("Hết bài hiện tại")');
  const title = await p.textContent('.player__title');
  await p.clock.fastForward(330_000); await p.clock.runFor(1000); // > 5:12, the longest of these tracks
  check('end-of-track timer pauses instead of advancing', (await p.getAttribute('.play-btn', 'aria-label')) === 'Phát' && (await p.textContent('.player__title')) === title, title);
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
})();
