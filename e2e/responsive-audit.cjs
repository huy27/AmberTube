// Responsive audit: every page, panel, menu and dialog at 12 viewports (+ Car View on car screens).
// Flags horizontal overflow, controls clipped by the viewport, content hidden behind the player,
// small touch targets on touch-size screens, and popovers/menus/panels that leave the viewport.
const { chromium } = require('playwright');
const BASE = process.env.AMBERTUBE_URL || 'http://localhost:4173';
const VIEWPORTS = [[320, 568], [375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 720], [1440, 900], [1920, 1080], [800, 480], [854, 480], [1024, 600], [844, 390], [667, 375]];
const CAR = new Set(['800x480', '854x480', '1024x600']);
const PAGES = ['/', '/search?q=lofi', '/library', '/playlists', '/playlists/PL', '/history', '/downloads', '/settings', '/search'];
const ONLY = process.env.ONLY;

const probe = () => {
  const W = innerWidth, H = innerHeight;
  const issues = [];
  const vis = (el) => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).toString().trim().slice(0, 40);
  // inside an intentional horizontal scroller (shelves, chips…) or a clipped container?
  const scroller = (el) => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const s = getComputedStyle(n); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return n; } return null; };
  const hidden = (el) => { for (let n = el; n; n = n.parentElement) { if (n.getAttribute && (n.getAttribute('aria-hidden') === 'true' || n.inert)) return true; } return false; };
  if (document.documentElement.scrollWidth > W + 1) issues.push(`page scrolls horizontally (${document.documentElement.scrollWidth}px)`);
  const touch = matchMedia('(pointer: coarse)').matches;
  const player = document.querySelector('.player, .player--car');
  const pTop = player ? player.getBoundingClientRect().top : H;
  const main = document.querySelector('.main__scroll');
  if (main && player && main.getBoundingClientRect().bottom > pTop + 1) issues.push(`content area extends under the player (${Math.round(main.getBoundingClientRect().bottom)} > ${Math.round(pTop)})`);
  for (const el of document.querySelectorAll('button, a[href], input, select, [role="menuitem"], [role="button"]')) {
    if (!vis(el) || hidden(el)) continue;
    const r = el.getBoundingClientRect();
    const sc = scroller(el);
    const inFixed = el.closest('.np, .side-panel, .menu, .popover__panel, .car-drawer, .searchbar__dropdown, .player, .player--car, .fm');
    if (!sc && (r.right > W + 1 || r.left < -1)) issues.push(`clipped horizontally: ${name(el)} [${Math.round(r.left)}–${Math.round(r.right)}]`);
    const scrollsY = (() => { for (let n = el.parentElement; n; n = n.parentElement) { const s = getComputedStyle(n); if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return true; } return false; })();
    if (inFixed && (r.bottom > H + 1 || r.top < -1) && !scrollsY) issues.push(`clipped vertically in fixed UI: ${name(el)}`);
    const pad = el.matches('.toggle') ? 18 : 0; // the switch has an enlarged ::before hit area
    if (touch && !el.matches('input, select') && !el.closest('.progress, .slider') && (r.width + pad < 40 || r.height + pad < 40) && !el.matches('.sr-only')) {
      // links in running text are fine; controls are not
      if (!(el.tagName === 'A' && el.closest('p'))) issues.push(`small touch target ${Math.round(r.width)}×${Math.round(r.height)}: ${name(el)} {${(el.className && el.className.baseVal === undefined ? el.className : '').toString().split(' ')[0]}}`);
    }
  }
  for (const sel of ['.menu', '.popover__panel', '.side-panel.is-open', '.searchbar__dropdown', '.np', '.car-drawer.is-open', '.toast-stack']) {
    for (const el of document.querySelectorAll(sel)) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > W + 1 || r.left < -1 || r.bottom > H + 1 || r.top < -1) issues.push(`${sel} outside viewport [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
  }
  // text that is cut without an ellipsis
  for (const el of document.querySelectorAll('h1:not(.sr-only), h2, h3, p, span:not(.sr-only), strong')) { // .sr-only is visually hidden on purpose
    if (!vis(el) || hidden(el) || el.children.length > 2) continue;
    const s = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && s.overflow !== 'visible' && s.textOverflow !== 'ellipsis' && !s.webkitLineClamp?.match(/\d/) && el.clientWidth > 0 && !scroller(el)?.matches('.shelf__row, .mood-grid, .tl-filters, .chips, .artist-row, .seg')) {
      if (el.textContent.trim().length > 2) issues.push(`text cut without ellipsis: "${el.textContent.trim().slice(0, 30)}"`);
    }
  }
  return [...new Set(issues)];
};

(async () => {
  const b = await chromium.launch();
  const report = {};
  let total = 0;
  for (const [w, h] of VIEWPORTS) {
    const key = `${w}x${h}`;
    for (const mode of CAR.has(key) ? ['desktop', 'car'] : ['desktop']) {
      if (ONLY && !key.match(ONLY)) continue;
      const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w <= 1024, isMobile: false });
      await ctx.addInitScript((m) => {
        if (!sessionStorage.getItem('init')) {
          localStorage.clear();
          localStorage.setItem('ambertube:display-mode', m);
          localStorage.setItem('ambertube:car-suggest-dismissed', '1');
          sessionStorage.setItem('init', '1');
        }
      }, mode);
      const p = await ctx.newPage();
      const add = (where, list) => { if (list.length) { (report[`${key} ${mode}`] ||= {})[where] = list; total += list.length; } };
      // seed: play something, favourite it, make a playlist
      await p.goto(BASE + '/search?q=lofi'); await p.waitForSelector('.video-row:not(.video-row--skeleton)');
      await p.click('.video-row >> nth=0'); await p.waitForTimeout(500);
      await p.evaluate(() => { const lib = JSON.parse(localStorage.getItem('ambertube:v1') || '{}'); lib.playlists = [{ id: 'PL', name: 'Nhạc lái xe buổi sáng rất dài để kiểm tra tràn chữ', tracks: [], createdAt: Date.now() }]; localStorage.setItem('ambertube:v1', JSON.stringify(lib)); });
      for (const path of PAGES) {
        await p.goto(BASE + path); await p.waitForTimeout(700);
        add(path, await p.evaluate(probe));
        if (path === '/search?q=lofi') {
          // more menu on the last visible row, queue + lyrics panels, search dropdown
          const rows = await p.$$('.video-row .more__btn');
          if (rows.length) { await rows[rows.length - 1].click({ force: true }); await p.waitForTimeout(250); add('more menu', await p.evaluate(probe)); await p.keyboard.press('Escape'); await p.mouse.click(2, 2); }
          await p.click('.searchbar__input'); await p.waitForTimeout(400); add('search dropdown', await p.evaluate(probe)); await p.keyboard.press('Escape');
          const q = await p.$('button[aria-label^="Hàng đợi"], .player__right button[aria-label*="hàng đợi" i], button[aria-label="Hàng đợi"]');
          await p.keyboard.press('q').catch(() => {}); await p.waitForTimeout(400); add('queue panel', await p.evaluate(probe)); await p.keyboard.press('q'); await p.waitForTimeout(300);
          await p.keyboard.press('l').catch(() => {}); await p.waitForTimeout(400); add('lyrics panel', await p.evaluate(probe)); await p.keyboard.press('l'); await p.waitForTimeout(300);
        }
      }
      // compact layouts: Now Playing + nav drawer
      if (await p.$('.cplayer__info')) {
        await p.goto(BASE + '/'); await p.waitForTimeout(500);
        await p.click('.cplayer__info, .cplayer__art'); await p.waitForTimeout(400); add('now playing', await p.evaluate(probe));
        await p.keyboard.press('Escape'); await p.waitForTimeout(200);
        if (await p.$('.topbar__menu')) { await p.click('.topbar__menu'); await p.waitForTimeout(350); add('nav drawer', await p.evaluate(probe)); await p.keyboard.press('Escape'); }
      } else {
        // desktop player popovers
        for (const sel of ['.speed .popover__trigger', '.sleep .popover__trigger']) { if (await p.$(sel) && await p.isVisible(sel)) { await p.click(sel); await p.waitForTimeout(250); add(`popover ${sel}`, await p.evaluate(probe)); await p.keyboard.press('Escape'); await p.mouse.click(2, 2); } }
      }
      await p.goto(BASE + '/focus'); await p.waitForTimeout(800); add('/focus', await p.evaluate(probe));
      await ctx.close();
    }
  }
  console.log(JSON.stringify(report, null, 1));
  console.log(`\n${total} issue(s)`);
  await b.close();
})();
