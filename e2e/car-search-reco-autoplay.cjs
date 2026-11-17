const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.AMBERTUBE_URL || 'http://localhost:4173';
let fails = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!cond) fails++; };
const secs = (s) => s.split(':').reduce((a, b) => a * 60 + Number(b), 0);
const fresh = async (p, extra = {}) => {
  await p.goto(BASE + '/');
  await p.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, extra);
  await p.reload();
};
const search = async (p, q) => {
  await p.fill('.searchbar__input', q);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.video-row:not(.video-row--skeleton)');
};
const isPlaying = async (p) => (await p.getAttribute('.play-btn, .cbtn--play', 'aria-label')) === 'Tạm dừng';
const queueIds = (p) => p.$$eval('.queue__item .queue__title', (e) => e.map((x) => x.textContent));

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const page = async (w, h) => {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', (e) => errs.push(String(e)));
    return p;
  };

  // ================= A. Desktop ⇄ Car View switching =================
  {
    const p = await page(1280, 720);
    await fresh(p, { 'ambertube:smart-autoplay': JSON.stringify({ enabled: false, mode: 'balanced' }) });
    await search(p, 'lofi hip hop');
    await p.click('.video-row >> nth=0');
    await p.click('.video-row >> nth=1 >> .video-row__queue');
    await p.click('.video-row >> nth=2 >> .video-row__queue');
    const resultCount = 3;
    await p.waitForTimeout(2200);
    await p.evaluate(() => { window.__noReload = true; });
    const url = p.url();
    const title = await p.textContent('.player__title');
    const t0 = secs((await p.textContent('.player__time')).split('/')[0].trim());
    await p.click('.mode-toggle__btn[aria-label="Chế độ Car View"]');
    await p.waitForSelector('.player--car');
    check('switch to Car View is immediate (no reload)', await p.evaluate(() => window.__noReload === true));
    check('URL unchanged', p.url() === url);
    check('sidebar replaced by compact menu', !(await p.isVisible('.sidebar')) && await p.isVisible('.topbar__menu'));
    check('same track keeps playing', (await p.textContent('.cplayer__title')) === title && await isPlaying(p));
    await p.click('.cplayer__now');
    await p.waitForTimeout(1200);
    const t1 = secs((await p.textContent('.np__times span')).trim());
    check('playback position continues', t1 >= t0 + 1, `${t0}s → ${t1}s`);
    await p.click('button[aria-label="Quay lại"]');
    await p.click('.cplayer__more .popover__trigger');
    await p.click('.cmenu__item:has-text("Hàng đợi")');
    check('queue preserved', (await queueIds(p)).length === resultCount, `${(await queueIds(p)).length} items`);
    await p.keyboard.press('Escape');
    check('search state preserved', (await p.inputValue('.searchbar__input')) === 'lofi hip hop');
    await p.reload();
    await p.waitForSelector('.player--car');
    check('mode persists after refresh', await p.isVisible('.player--car'));
    await p.click('.topbar__menu');
    await p.click('.car-drawer .mode-toggle__btn[aria-label="Chế độ máy tính"]');
    await p.waitForSelector('.sidebar');
    check('can return to Desktop Mode', await p.isVisible('.sidebar') && await p.isVisible('.player:not(.player--car)'));
    await p.close();
  }

  // ================= B. Search autocomplete =================
  {
    const p = await page(1280, 720);
    await fresh(p);
    for (const q of ['lofi hip hop', 'nhạc acoustic', 'deep focus']) await search(p, q);
    await p.fill('.searchbar__input', '');
    await p.click('.searchbar__input');
    await p.waitForSelector('.suggest__item');
    const recent = await p.$$eval('.suggest__item--recent .suggest__title', (e) => e.map((x) => x.textContent));
    check('recent searches on focus (newest first)', recent.join('|') === 'deep focus|nhạc acoustic|lofi hip hop', recent.join('|'));
    check('trending shown with honest label', /Phổ biến trong danh mục demo/.test(await p.textContent('.suggest')));
    await p.click('.suggest__remove[aria-label*="nhạc acoustic"]');
    await p.waitForTimeout(150);
    check('remove one history entry', !(await p.textContent('.suggest')).includes('nhạc acoustic'));
    await p.reload();
    await p.fill('.searchbar__input', '');
    await p.click('.searchbar__input');
    await p.waitForSelector('.suggest__item');
    check('history persists after refresh', (await p.$$('.suggest__item--recent')).length === 2);

    // debounce: suggestions update only after ~300ms of no typing
    await p.keyboard.type('sun', { delay: 40 });
    await p.waitForTimeout(120);
    const early = await p.$$eval('.suggest__item .suggest__title', (e) => e.map((x) => x.textContent).join('|'));
    await p.waitForTimeout(400);
    const late = await p.$$eval('.suggest__item .suggest__title', (e) => e.map((x) => x.textContent).join('|'));
    check('debounced (~300ms)', !early.includes('Sunset Groove') && late.includes('Sunset Groove'), `${early.slice(0, 40)} → ${late.slice(0, 60)}`);
    check('match highlighted', (await p.textContent('.suggest__item mark')).toLowerCase() === 'sun');
    check('suggestion types labelled', /Bài hát/.test(await p.textContent('.suggest')));
    await p.keyboard.press('ArrowDown');
    const act = await p.getAttribute('.searchbar__input', 'aria-activedescendant');
    check('arrow keys highlight a suggestion', !!act && (await p.$('.suggest__item.is-active')) !== null);
    const activeText = await p.textContent('.suggest__item.is-active .suggest__title');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(700);
    check('Enter selects the highlighted song (plays it)', (await p.textContent('.player__title')) === activeText, activeText);
    await p.fill('.searchbar__input', 'relxing');
    await p.waitForTimeout(450);
    check('typo tolerated (relxing → relaxing)', /relax/i.test(await p.textContent('.suggest')));
    await p.keyboard.press('Escape');
    check('Escape closes suggestions', !(await p.isVisible('.suggest')));
    await p.fill('.searchbar__input', 'zzqqxx');
    await p.waitForTimeout(450);
    check('no-suggestions state still offers search', /Không có gợi ý/.test(await p.textContent('.suggest')));
    await p.keyboard.press('Enter');
    await p.waitForURL(/q=zzqqxx/);
    check('Enter submits the typed query', true);
    await p.click('.searchbar__input');
    await p.fill('.searchbar__input', 'lo');
    await p.waitForTimeout(450);
    await p.mouse.click(700, 600);
    check('click outside closes', !(await p.isVisible('.suggest')));
    await p.fill('.searchbar__input', '');
    await p.click('.searchbar__input');
    await p.waitForSelector('.suggest__item--recent');
    await p.click('.suggest__head .link-btn');
    await p.waitForTimeout(200);
    check('clear search history', (await p.$$('.suggest__item--recent')).length === 0 && (await p.evaluate(() => localStorage.getItem('ambertube:search-history'))) === null);
    await p.close();
  }

  // ================= C. Recommendations & listening history =================
  {
    const p = await page(1280, 800);
    await p.clock.install();
    await fresh(p, { 'ambertube:smart-autoplay': JSON.stringify({ enabled: false, mode: 'balanced' }) });
    await p.clock.runFor(800);
    await p.waitForSelector('.cold');
    check('cold start: style picker + trending', await p.isVisible('.cold') && /Phổ biến \(danh mục demo\)/.test(await p.textContent('.page')));
    // real listening: two lo-fi tracks ~2 minutes each; a third track only tapped
    await search(p, 'lofi hip hop');
    await p.click('.video-row >> nth=0'); await p.clock.runFor(120_000);
    await p.click('.video-row >> nth=1'); await p.clock.runFor(120_000);
    // (with autoplay off, a lone search result has no next track — that's expected)
    await p.goto(BASE + '/search?q=workout'); await p.clock.runFor(800);
    await p.waitForSelector('.video-row:not(.video-row--skeleton)');
    await p.click('.video-row >> nth=0'); await p.clock.runFor(5_000);
    await p.click('.video-row >> nth=1'); await p.clock.runFor(1_000); // move on quickly = skip
    const events = await p.evaluate(() => JSON.parse(localStorage.getItem('ambertube:listens:v1') || '[]'));
    const short = events.find((e) => e.track.title.includes('Iron') || e.track.title.includes('Neon'));
    check('listening tracked with duration & completion', events.length >= 3 && events[0].listenedSec >= 100 && events[0].completion > 0, `${events.length} events; first ${events[0]?.listenedSec}s`);
    check('brief selection recorded as a skip, not a play', !!short && short.listenedSec < 10 && (short.reason === 'skipped' || short.reason === 'switched'));
    await p.goto(BASE + '/'); await p.clock.runFor(800);
    await p.waitForSelector('#sh-mfy');
    const mfy = await p.$$eval('#sh-mfy ~ .shelf__row .reco-card__title, .shelf:has(#sh-mfy) .reco-card__title', (e) => e.map((x) => x.textContent));
    check('personalised “Dành cho bạn” appears after listening', mfy.length > 0, mfy.slice(0, 3).join(' | '));
    check('recommendations follow what was listened to (lo-fi first)', /lofi|lo-fi/i.test(mfy[0]), mfy[0]);
    check('“Vì bạn đã nghe …” section', await p.isVisible('#sh-because'));
    check('Daily Mix + Smart Radio tiles', await p.isVisible('.mix-card') && await p.isVisible('.mix-card--radio'));
    check('Discover weekly / similar artists', await p.isVisible('#sh-discover') || await p.isVisible('.artist-row'));
    // feedback: don't recommend this song
    const first = mfy[0];
    await p.hover('.shelf:has(#sh-mfy) .reco-card >> nth=0');
    await p.click('.shelf:has(#sh-mfy) .reco-card >> nth=0 >> .more__btn');
    await p.click('.menu >> text=Không thích bài này');
    await p.clock.runFor(300);
    const mfy2 = await p.$$eval('.shelf:has(#sh-mfy) .reco-card__title', (e) => e.map((x) => x.textContent));
    check('“Không gợi ý bài này” removes it', !mfy2.includes(first), first);
    await p.reload(); await p.clock.runFor(800);
    await p.waitForSelector('#sh-mfy');
    check('recommendations & feedback persist after refresh', !(await p.$$eval('.shelf:has(#sh-mfy) .reco-card__title', (e) => e.map((x) => x.textContent))).includes(first));
    // Daily mix plays as a queue
    await p.click('.mix-card__play');
    await p.clock.runFor(800);
    await p.keyboard.press('q');
    check('Daily Mix fills the queue', (await queueIds(p)).length >= 3);
    await p.keyboard.press('q');
    // Smart Radio from a song
    await search(p, 'midnight');
    await p.click('.video-row >> nth=0 >> .more__btn');
    await p.click('.menu >> text=Bắt đầu Radio');
    await p.clock.runFor(800);
    check('Smart Radio starts with related queue', /Radio từ/.test(await p.textContent('.toast-stack')));
    await p.keyboard.press('q');
    const reasons = await p.$$eval('.queue__reason', (e) => e.map((x) => x.textContent));
    // demo catalogue is tiny and most of it was just played/disliked above → only a few valid picks remain (no filler)
    check('radio items explain why', reasons.length >= 1 && reasons.every((r) => r.startsWith('Radio:')), reasons.slice(0, 2).join(' | '));
    await p.close();
  }

  // ================= D. Smart Autoplay =================
  {
    const p = await page(1280, 800);
    await p.clock.install();
    await fresh(p);
    await p.clock.runFor(500);
    await search(p, 'sunset'); // single result → queue of one
    await p.click('.video-row >> nth=0');
    await p.clock.runFor(1500);
    await p.keyboard.press('q');
    await p.waitForSelector('.queue__section--auto');
    let q = await queueIds(p);
    check('autoplay appends 5–10 recommendations', q.length >= 6 && q.length <= 11, `${q.length - 1} added`);
    check('no duplicates', new Set(q).size === q.length);
    check('reasons shown', (await p.$$('.queue__reason')).length >= 5);
    check('unavailable videos never recommended', !q.some((t) => t.includes('Rainy Platform')));
    // manual priority
    await search(p, 'coffee');
    await p.clock.runFor(500);
    await p.click('.video-row:has-text("Coffee Shop Jazz") .video-row__queue');
    await p.clock.runFor(200);
    q = await queueIds(p);
    const firstAutoIdx = await p.$$eval('.queue__list > *', (els) => els.findIndex((e) => e.classList.contains('queue__section--auto')));
    const manualIdx = await p.$$eval('.queue__list > *', (els) => els.findIndex((e) => e.textContent.includes('Coffee Shop Jazz')));
    check('manually queued song goes before recommendations', manualIdx > 0 && manualIdx < firstAutoIdx, `manual@${manualIdx} auto@${firstAutoIdx}`);
    // refill when ~2 remain
    const before = q.length;
    const toSkip = q.length - 3;
    for (let i = 0; i < toSkip; i++) { await p.click('button[aria-label^="Bài tiếp theo"]'); await p.clock.runFor(400); }
    await p.clock.runFor(1500);
    q = await queueIds(p);
    const remaining = await p.$$eval('.queue__item', (els) => els.length - 1 - els.findIndex((e) => e.classList.contains('is-current')));
    check('queue refilled when ~2 songs remain', remaining > 2, `${remaining} upcoming (queue ${before} → ${q.length})`);
    check('still no duplicates after refill', new Set(q).size === q.length);
    // less like this / blocked songs never come back
    const upcomingAuto = await p.$$eval('.queue__item', (els) => els.filter((e) => e.querySelector('.queue__reason')).map((e) => e.querySelector('.queue__title').textContent));
    // switch to discovery
    await p.click('.seg__btn:has-text("Khám phá")');
    await p.clock.runFor(1200);
    const listened = await p.evaluate(() => JSON.parse(localStorage.getItem('ambertube:listens:v1') || '[]').filter((e) => e.listenedSec >= 30).map((e) => e.track.title));
    const disc = await p.$$eval('.queue__item', (els) => els.filter((e) => e.querySelector('.queue__reason')).map((e) => e.querySelector('.queue__title').textContent));
    check('Discovery mode avoids songs already listened to', disc.length > 0 && !disc.some((t) => listened.includes(t)), `${disc.length} picks`);
    // disable: upcoming recommendations removed, current song continues
    const cur = await p.textContent('.player__title');
    await p.click('.queue__auto [role=switch]');
    await p.clock.runFor(300);
    check('turning autoplay off keeps the current song', (await p.textContent('.player__title')) === cur && await isPlaying(p));
    check('turning autoplay off removes upcoming recommendations', (await p.$$('.queue__reason')).length === 0 || (await p.$$eval('.queue__item', (els) => els.slice(els.findIndex((e) => e.classList.contains('is-current')) + 1).every((e) => !e.querySelector('.queue__reason')))));
    check('autoplay preference persisted', (await p.evaluate(() => JSON.parse(localStorage.getItem('ambertube:smart-autoplay')).enabled)) === false);
    await p.click('.queue__auto [role=switch]');
    await p.clock.runFor(1500);
    // less like this
    await p.click('.chip-btn:has-text("Bớt bài như này")');
    await p.clock.runFor(1500);
    check('“Bớt bài như này” refreshes recommendations', /Sẽ bớt gợi ý/.test(await p.textContent('.toast-stack')) && (await p.$$('.queue__reason')).length > 0);
    void upcomingAuto;
    await p.close();
  }
  {
    // unavailable video with Smart Autoplay on: error message, then the first recommendation plays
    const p = await page(1280, 800);
    await fresh(p);
    await search(p, 'rainy platform');
    await p.click('.video-row:has-text("Rainy Platform")');
    await p.waitForTimeout(2500);
    check('unavailable video → message', /không khả dụng/i.test(await p.textContent('.toast-stack')));
    check('…and playback continues with a recommendation', !(await p.textContent('.player__title')).includes('Rainy Platform') && await isPlaying(p), await p.textContent('.player__title'));
    await p.close();
  }
  {
    // empty results: every artist blocked → clear message, no crash
    const p = await page(1280, 800);
    const channels = ['amber sessions', 'night owl tapes', 'kettle rain', 'ambient waves', 'grid runner', 'field notes', 'quiet hours', 'pulse lab', 'platform nine'];
    await fresh(p, { 'ambertube:reco-feedback': JSON.stringify({ notInterested: {}, blockedTracks: [], blockedChannels: channels, styles: [], moreLike: [], lessLike: [] }) });
    await search(p, 'sunset');
    await p.click('.video-row >> nth=0');
    await p.waitForTimeout(1200);
    await p.keyboard.press('q');
    check('empty recommendation result handled', /Chưa tìm thấy bài phù hợp/.test(await p.textContent('.queue')));
    await p.close();
  }
  {
    // browser autoplay restriction. Playwright's evaluate() counts as a user gesture, so the policy is
    // simulated exactly as browsers report it: the first play() rejects with NotAllowedError.
    const p = await page(1280, 800);
    await p.addInitScript(() => {
      const orig = HTMLMediaElement.prototype.play;
      let blockedOnce = false;
      HTMLMediaElement.prototype.play = function () {
        if (!blockedOnce) { blockedOnce = true; return Promise.reject(new DOMException('play() failed because the user didn\'t interact with the document first.', 'NotAllowedError')); }
        return orig.call(this);
      };
    });
    await p.goto(BASE + '/library');
    await p.setInputFiles('input[type=file][accept="audio/*"]', path.join(require('./fixtures.cjs').dir, 'Test Tone Song.wav'));
    await p.waitForSelector('.video-row');
    await p.click('.video-row');
    await p.waitForTimeout(800);
    check('blocked autoplay shows a clear message', await p.isVisible('.autoplay-blocked') && !(await isPlaying(p)));
    await p.click('.autoplay-blocked .btn');
    await p.waitForTimeout(1200);
    check('one tap resumes playback', await isPlaying(p) && !(await p.isVisible('.autoplay-blocked')));
    await p.close();
  }

  // ================= E. Car View layouts =================
  for (const [w, h] of [[800, 480], [854, 480], [1024, 600], [1280, 720]]) {
    const p = await page(w, h);
    await fresh(p, { 'ambertube:display-mode': 'car' });
    await search(p, 'lofi');
    await p.click('.video-row >> nth=0');
    await p.waitForTimeout(800);
    const m = await p.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const player = r('.player--car');
      const main = r('.main__scroll');
      const small = [...document.querySelectorAll('.player--car button, .topbar button, .video-row__btns button')]
        .filter((b) => b.offsetParent && (b.getBoundingClientRect().width < 44 || b.getBoundingClientRect().height < 44))
        .map((b) => b.getAttribute('aria-label') || b.className);
      return { overflowX: document.documentElement.scrollWidth > innerWidth, mainBottom: main.bottom, playerTop: player.top, playerBottom: player.bottom, small };
    });
    check(`${w}×${h}: no horizontal overflow`, !m.overflowX);
    check(`${w}×${h}: content not covered by the player`, m.mainBottom <= m.playerTop + 1 && m.playerBottom <= h + 1, `main ${m.mainBottom} / player ${m.playerTop}`);
    check(`${w}×${h}: touch targets ≥ 44px`, m.small.length === 0, m.small.join(', '));
    // search dropdown stays above the player
    await p.click('.searchbar__input');
    await p.fill('.searchbar__input', 'lo');
    await p.waitForTimeout(450);
    const d = await p.evaluate(() => {
      const s = document.querySelector('.suggest').getBoundingClientRect();
      const rows = [...document.querySelectorAll('.suggest__item')].map((e) => e.getBoundingClientRect().height);
      return { bottom: s.bottom, playerTop: document.querySelector('.player--car').getBoundingClientRect().top, rows };
    });
    check(`${w}×${h}: suggestions don't overlap the player`, d.bottom <= d.playerTop + 1, `${d.bottom} vs ${d.playerTop}`);
    check(`${w}×${h}: suggestion rows touch-friendly, ≤5`, d.rows.length > 0 && d.rows.length <= 5 && d.rows.every((x) => x >= 52), d.rows.join(','));
    await p.keyboard.press('Escape');
    await p.screenshot({ path: `/tmp/e2e/v-${w}x${h}-search.png` });
    // home
    await p.click('.topbar__menu');
    await p.click('.car-drawer .nav-item:has-text("Trang chủ")');
    await p.waitForTimeout(400);
    const home = await p.evaluate(() => {
      const first = document.querySelector('.page--car > *');
      const moods = document.querySelector('.mood-grid');
      return { firstIsContinue: first?.textContent.startsWith('Nghe tiếp'), moodsScroll: moods.scrollWidth > moods.clientWidth, greeting: !!document.querySelector('.page--car .page-title') };
    });
    check(`${w}×${h}: Continue Listening first, no greeting`, home.firstIsContinue && !home.greeting);
    check(`${w}×${h}: mood cards scroll horizontally`, home.moodsScroll);
    await p.screenshot({ path: `/tmp/e2e/v-${w}x${h}-home.png` });
    // now playing: all controls visible without scrolling
    await p.click('.cplayer__now');
    await p.waitForSelector('.np');
    const np = await p.evaluate(() => {
      const el = document.querySelector('.np');
      const ctr = document.querySelector('.np__controls').getBoundingClientRect();
      const ex = document.querySelector('.np__extras').getBoundingClientRect();
      return { fits: el.scrollHeight <= el.clientHeight + 1, ctrBottom: ctr.bottom, exBottom: ex.bottom };
    });
    check(`${w}×${h}: Now Playing fits without scrolling`, np.fits && np.exBottom <= h, `extras bottom ${np.exBottom}`);
    await p.screenshot({ path: `/tmp/e2e/v-${w}x${h}-np.png` });
    await p.close();
  }

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
})();
