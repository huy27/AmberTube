const { chromium } = require('playwright');
const BASE = process.env.AMBERTUBE_URL || 'http://localhost:4173';
let fails = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!cond) fails++; };
const COUNT_AUDIO = () => {
  window.__bufferSources = 0;
  const orig = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function () { window.__bufferSources++; return orig.call(this); };
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(COUNT_AUDIO);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.clock.install();
  const time = () => p.textContent('.fm-ring__time');
  const label = () => p.textContent('.fm-ring__label');
  const playing = async () => (await p.getAttribute('.fm-player .play-btn, .player .play-btn', 'aria-label')) === 'Tạm dừng';

  await p.goto(BASE + '/search?q=ambient');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.clock.runFor(1000);
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
  await p.click('.video-row >> nth=0');
  await p.clock.runFor(2000);
  const title = await p.textContent('.player__title');

  // ---------- enter ----------
  await p.click('.nav-item:has-text("Tập trung")');
  await p.waitForSelector('.fm-ring');
  check('Focus mode opens at /focus', new URL(p.url()).pathname === '/focus');
  check('sidebar, search and results hidden', !(await p.isVisible('.sidebar')) && !(await p.isVisible('.searchbar')) && !(await p.isVisible('.video-row')));
  check('music keeps playing on enter', await playing());
  check('current song shown', (await p.textContent('.fm-track__title')) === title, title);
  check('default 25:00 focus session', (await time()) === '25:00' && (await label()) === 'Phiên tập trung');

  // ---------- durations ----------
  await p.click('.fm-chip:has-text("15′")');
  check('15-minute preset', (await time()) === '15:00');
  await p.click('.fm-chip:has-text("Tùy chỉnh")');
  await p.fill('.fm-custom input', '1');
  await p.keyboard.press('p'); // typing target: must not start the timer
  await p.fill('.fm-custom input', '1');
  await p.click('.fm-custom button');
  await p.clock.runFor(100);
  check('custom duration', (await time()) === '01:00');
  check('shortcut ignored while typing', (await p.textContent('.fm-btn--primary')).includes('Bắt đầu'));

  // ---------- start / pause / resume / reset ----------
  await p.click('.fm-btn--primary');
  await p.clock.runFor(10_000);
  check('counts down', (await time()) === '00:50', await time());
  check('status shows running session', /Đang tập trung · Phiên 1/.test(await p.textContent('.fm-status')));
  await p.click('.fm-btn--primary:has-text("Tạm dừng")');
  await p.clock.runFor(30_000);
  check('paused time does not pass', (await time()) === '00:50');
  await p.keyboard.press('p');
  await p.clock.runFor(5_000);
  check('P resumes', (await time()) === '00:45', await time());
  await p.keyboard.press('r');
  check('R resets', (await time()) === '01:00' && (await p.textContent('.fm-btn--primary')).includes('Bắt đầu'));

  // ---------- completion ----------
  const sourcesBefore = await p.evaluate(() => window.__bufferSources);
  await p.keyboard.press('p');
  await p.clock.runFor(61_000);
  await p.waitForSelector('.fm-done');
  check('completion message', /Tuyệt vời! Bạn đã hoàn thành phiên tập trung\./.test(await p.textContent('.fm-done')));
  check('stats updated', (await p.textContent('.fm-stats__num')) === '1' && /1 \/ 4 phút/.test(await p.textContent('.fm-stats__list')), await p.textContent('.fm-stats__list'));
  check('break auto-started (default)', (await label()) === 'Nghỉ ngắn' && /Đang nghỉ ngắn/.test(await p.textContent('.fm-status')));
  check('music not interrupted', await playing());
  check('cycle dot filled', (await p.$$('.fm-ring__cycle i.is-done')).length === 1);
  check('completion chime played', (await p.evaluate(() => window.__bufferSources)) >= sourcesBefore);

  await p.click('.fm-done >> text=Bỏ nghỉ, tập trung tiếp');
  check('“keep focusing” starts focus', (await label()) === 'Phiên tập trung' && !(await p.isVisible('.fm-done')));
  await p.click('button[aria-label^="Bỏ qua"]');
  check('skip moves to the break', (await label()) === 'Nghỉ ngắn');
  check('skipped focus not counted', (await p.textContent('.fm-stats__num')) === '1');

  // ---------- full Pomodoro cycle ----------
  await p.click('button[aria-label="Cài đặt Tập trung"]');
  await p.click('.fs-row:has-text("Tự bắt đầu phiên tập trung") [role=switch]');
  await p.click('button[aria-label="Giảm Nghỉ ngắn"]'); await p.click('button[aria-label="Giảm Nghỉ ngắn"]');
  await p.click('button[aria-label="Giảm Nghỉ ngắn"]'); await p.click('button[aria-label="Giảm Nghỉ ngắn"]'); // 1 min
  await p.click('button[aria-label="Đóng cài đặt"]');
  await p.click('button[aria-label^="Bỏ qua"]'); // skip current 5-min break → focus (1 min)
  const seen = [];
  for (let i = 0; i < 12 && (await label()) !== 'Nghỉ dài'; i++) {
    seen.push(await label());
    await p.clock.runFor(60_500);
  }
  check('long break after 4 focus sessions', (await label()) === 'Nghỉ dài', seen.join(' → '));
  check('4 sessions recorded', (await p.textContent('.fm-stats__num')) === '4');
  check('all cycle dots done', (await p.$$('.fm-ring__cycle i.is-done')).length === 4);
  check('goal reached = 100%', /100%/.test(await p.textContent('.fm-stats__list')) && (await p.isVisible('.fm-stats__trophy')));

  // ---------- drift / background tab ----------
  await p.keyboard.press('Escape'); // dismiss dialog
  const secs = (t) => t.split(':').reduce((a, x) => a * 60 + Number(x), 0);
  const t0 = await time();
  await p.clock.fastForward(5 * 60_000 + 30_000); // timers barely fire, like a throttled background tab
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.clock.runFor(300);
  const t1 = await time();
  check('no drift after the tab slept (timestamp-based)', Math.abs(secs(t0) - secs(t1) - 330) <= 1, `${t0} − 5:30 → ${t1}`);
  // let the long break finish while "asleep": the next focus starts exactly when it ended
  await p.clock.fastForward(secs(t1) * 1000 + 20_000);
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.clock.runFor(300);
  check('phase change caught up after sleep', (await label()) === 'Phiên tập trung' && Math.abs(secs(await time()) - 40) <= 1, `${await label()} ${await time()}`);
  if (await p.isVisible('.fm-done')) await p.keyboard.press('Escape');

  // ---------- ambient mixer ----------
  const s0 = await p.evaluate(() => window.__bufferSources);
  await p.click('.fm-side--left button[aria-label="Bật Mưa"]');
  await p.click('.fm-side--left button[aria-label="Bật Quán cà phê"]');
  await p.clock.runFor(1500);
  const s1 = await p.evaluate(() => window.__bufferSources);
  check('ambient sounds start (Web Audio voices created)', s1 > s0, `${s0} → ${s1}`);
  check('two sounds active at once', (await p.$$('.fm-side--left .fm-sound.is-on')).length === 2);
  await p.locator('.fm-side--left input[aria-label="Âm lượng Mưa"]').fill('80');
  await p.click('.fm-side--left button[aria-label="Tắt tiếng âm thanh nền"]');
  check('ambient mute', (await p.getAttribute('.fm-side--left button[aria-label="Bật tiếng âm thanh nền"]', 'aria-pressed')) === 'true');
  await p.click('.fm-side--left button[aria-label="Bật tiếng âm thanh nền"]');

  // ---------- settings persistence ----------
  await p.click('button[aria-label="Cài đặt Tập trung"]');
  await p.click('button[aria-label="Tăng Nghỉ dài"]');
  await p.click('.fs-preset--midnight');
  await p.click('button[aria-label="Đóng cài đặt"]');
  check('background preset applied', await p.isVisible('.fm-bg--midnight'));
  const timeBeforeReload = await time();
  await p.reload();
  await p.clock.runFor(500);
  await p.waitForSelector('.fm-ring');
  await p.click('button[aria-label="Cài đặt Tập trung"]');
  check('settings persist after reload', (await p.inputValue('input[aria-label="Nghỉ dài"]')) === '16' && await p.isVisible('.fm-bg--midnight'));
  check('ambient prefs persist', (await p.getAttribute('.fs-drawer button[aria-label="Tắt Mưa"]', 'aria-pressed')) === 'true' && (await p.inputValue('.fs-drawer input[aria-label="Âm lượng Mưa"]')) === '80');
  check('running session survives reload', (await label()) === 'Phiên tập trung' && (await p.textContent('.fm-btn--primary')).includes('Tạm dừng'), `${timeBeforeReload} → ${await time()}`);
  await p.click('button[aria-label="Đóng cài đặt"]');
  const statsAfter = Number(await p.textContent('.fm-stats__num'));
  check('stats persist after reload', statsAfter >= 4, `${statsAfter} sessions`);

  // ---------- single timer across tabs ----------
  const p2 = await ctx.newPage();
  await p2.goto(BASE + '/focus');
  await p2.waitForSelector('.fm-ring');
  check('second tab shows the same session', (await p2.textContent('.fm-ring__label')) === (await label()) && (await p2.textContent('.fm-stats__num')) === (await p.textContent('.fm-stats__num')),
    `${await p2.textContent('.fm-ring__label')} / ${await label()}`);
  await p.keyboard.press('p'); // pause in tab 1
  await p2.waitForTimeout(300);
  check('pausing in one tab pauses the other', (await p2.textContent('.fm-btn--primary')).includes('Tiếp tục'));
  await p2.close();

  // ---------- music shortcuts ----------
  await p.click('.play-btn'); // music was paused by reload; start it
  await p.clock.runFor(800);
  const before = await p.textContent('.fm-track__title');
  await p.keyboard.press('n');
  await p.clock.runFor(800);
  check('N = next track', (await p.textContent('.fm-track__title')) !== before);
  await p.locator('.fm-ring').click();
  await p.keyboard.press('Space');
  check('Space pauses music', !(await playing()));
  await p.keyboard.press('Space');
  check('Space plays music', await playing());
  await p.keyboard.press('m');
  check('M mutes', (await p.inputValue('.fm-player .slider')) === '0');
  await p.keyboard.press('m');

  // ---------- exit ----------
  const trackInFocus = await p.textContent('.fm-track__title');
  await p.keyboard.press('Escape');
  await p.waitForSelector('.sidebar');
  check('Esc exits Focus mode', new URL(p.url()).pathname !== '/focus');
  check('music continues after exit', (await p.textContent('.player__title')) === trackInFocus && await playing());
  check('timer pill shown in the app', await p.isVisible('.focus-pill'));
  await p.goto(BASE + '/history');
  await p.clock.runFor(500);
  await p.click('.focus-pill');
  await p.waitForSelector('.fm-ring');
  check('pill reopens Focus mode', new URL(p.url()).pathname === '/focus');
  await p.click('.fm-exit');
  await p.waitForSelector('.sidebar');
  check('Exit button returns to previous page', new URL(p.url()).pathname === '/history', p.url());

  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
})();
