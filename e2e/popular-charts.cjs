// "Phổ biến tại Việt Nam" (geo.getTopTracks) + "Thịnh hành toàn cầu" (chart.getTopTracks), Last.fm and YouTube mocked.
// Needs the API build:  VITE_YOUTUBE_API_KEY=TEST_KEY VITE_LASTFM_API_KEY=TEST npx vite build --outDir /tmp/dist-api
const { chromium } = require('playwright');
const URL0 = process.env.AMBERTUBE_API_URL || 'http://localhost:4174';
const PH = 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';
const TOTAL = { vietnam: 45, global: 30 };
// VN #21 repeats #1 (Last.fm pages can overlap) → must be shown once
const song = (src, i) => src === 'vietnam'
  ? (i === 21 ? { t: 'Bài VN 1', a: 'Ca sĩ 1' } : { t: i === 3 ? 'Bài Không Có Trên YouTube' : `Bài VN ${i}`, a: `Ca sĩ ${i}` })
  : { t: `Global Song ${i}`, a: `Artist ${i}` };
const lastfmTrack = (src, i) => {
  const { t, a } = song(src, i);
  return { name: t, artist: { name: a, mbid: '', url: '' }, listeners: String(90000 - i * 100), url: `https://www.last.fm/music/${i}`, mbid: '',
    image: i === 1 ? [{ '#text': 'https://img.test/cover.jpg', size: 'extralarge' }] : i === 2 ? [{ '#text': PH, size: 'extralarge' }] : [{ '#text': '', size: 'large' }], '@attr': { rank: String(i - 1) } };
};
(async () => {
  const b = await chromium.launch();
  let fails = 0;
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fails++; };
  const chartOk = (route, u) => {
    const m = u.searchParams.get('method').toLowerCase();
    const src = m === 'geo.gettoptracks' ? 'vietnam' : 'global';
    const page = Number(u.searchParams.get('page')), limit = Number(u.searchParams.get('limit'));
    const track = []; for (let i = (page - 1) * limit + 1; i <= Math.min(TOTAL[src], page * limit); i++) track.push(lastfmTrack(src, i));
    return route.fulfill({ json: { tracks: { track, '@attr': { page: String(page), perPage: String(limit), totalPages: String(Math.ceil(TOTAL[src] / limit)), total: String(TOTAL[src]) } } } });
  };
  async function context(mode, charts, viewport = { width: 1360, height: 860 }) {
    const ctx = await b.newContext({ viewport, hasTouch: viewport.width < 1024 });
    const calls = { lastfm: [], yt: [] };
    const videos = new Map(); let n = 0;
    await ctx.route('https://ws.audioscrobbler.com/**', (route) => {
      const u = new URL(route.request().url()); const q = Object.fromEntries(u.searchParams); calls.lastfm.push(q);
      if (q.country !== undefined && q.country !== 'Viet Nam') return route.fulfill({ json: { error: 6, message: 'country param invalid', links: [] } });
      if (q.method.toLowerCase() === 'track.getinfo') {
        if (q.artist === 'Ca sĩ 4') return route.fulfill({ json: { error: 6, message: 'Track not found' } });
        const img = q.track === 'Bài VN 2' ? 'https://img.test/album.jpg' : PH;
        return route.fulfill({ json: { track: { name: q.track, album: { title: 'X', image: [{ '#text': img, size: 'extralarge' }] } } } });
      }
      if (q.method.toLowerCase() === 'geo.gettopartists') return route.fulfill({ json: { topartists: { artist: [], '@attr': { totalPages: '0' } } } });
      return charts(route, u);
    });
    await ctx.route(/https:\/\/img\.test\/(cover|album)\.jpg/, (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#c80"/></svg>' }));
    await ctx.route('https://lastfm.freetls.fastly.net/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: '' }));
    await ctx.route('https://i.ytimg.com/**', (r) => r.abort());
    await ctx.route('https://www.googleapis.com/youtube/v3/**', (route) => {
      const u = new URL(route.request().url()); calls.yt.push(Object.fromEntries(u.searchParams));
      if (u.pathname.endsWith('/search')) {
        const q = u.searchParams.get('q'); const [a, t] = q.split(' - ');
        const add = (title, ch, dur = 215) => { const id = `v${String(++n).padStart(10, '0')}`; videos.set(id, [title, ch, dur]); return id; };
        const ids = /Không Có/.test(t)
          ? [add('Một bài khác hẳn (Official MV)', 'Kênh Khác'), add(`${a} - Bài Khác (Official Audio)`, a)]
          : [add(`${t} (Cover)`, 'Cover Channel'), add(`${a} - ${t} (Remix)`, 'DJ'), add(`${a} - ${t} (Official MV)`, a), add(t, `${a} - Topic`), add(`${a} - ${t} (Lyrics)`, 'Lyrics Hub')];
        return route.fulfill({ json: { items: ids.map((id) => ({ id: { videoId: id } })) } });
      }
      if (u.searchParams.get('chart')) return route.fulfill({ json: { items: [] } });
      const ids = (u.searchParams.get('id') || '').split(',');
      return route.fulfill({ json: { items: ids.filter((id) => videos.has(id)).map((id) => { const [title, ch, dur] = videos.get(id); return { id, snippet: { title, channelTitle: ch, channelId: 'UCx', liveBroadcastContent: 'none', thumbnails: {}, categoryId: '10' }, contentDetails: { duration: `PT3M${dur - 180}S` }, statistics: { viewCount: '1000' }, status: { license: 'youtube' } }; }) } });
    });
    await ctx.addInitScript((m) => {
      if (!sessionStorage.getItem('i')) { localStorage.clear(); localStorage.setItem('ambertube:display-mode', m); localStorage.setItem('ambertube:car-suggest-dismissed', '1'); sessionStorage.setItem('i', '1'); }
      class Player { constructor(el, o) { window.__players = (window.__players || 0) + 1; this.o = o; setTimeout(() => o.events.onReady({ target: this }), 10); }
        _s(s) { this.state = s; this.o.events.onStateChange({ target: this, data: s }); }
        loadVideoById({ videoId }) { this.vid = videoId; window.__loaded = videoId; setTimeout(() => { this.since = performance.now(); this._s(1); }, 20); }
        cueVideoById() { this._s(5); } playVideo() { this._s(1); } pauseVideo() { this._s(2); } stopVideo() {} seekTo() {}
        getCurrentTime() { return this.since ? (performance.now() - this.since) / 1000 : 0; } getDuration() { return 215; } getPlayerState() { return this.state ?? -1; }
        setVolume() {} mute() {} unMute() {} setPlaybackRate() {} getPlaybackRate() { return 1; } getAvailablePlaybackRates() { return [1]; } getVideoData() { return {}; } }
      window.YT = { Player };
    }, mode);
    return { ctx, calls, videos };
  }
  const chartCalls = (calls, m) => calls.lastfm.filter((c) => c.method.toLowerCase() === m);
  const VN = '.shelf:has(#sh-chart-vietnam)', GL = '.shelf:has(#sh-chart-global)';

  // ---------- happy path (desktop) ----------
  {
    const { ctx, calls, videos } = await context('desktop', chartOk);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(URL0 + '/');
    await p.waitForSelector(`${VN} .reco-card:not(.reco-card--sk)`); await p.waitForSelector(`${GL} .reco-card:not(.reco-card--sk)`);
    const v = chartCalls(calls, 'geo.gettoptracks')[0] || {}, g = chartCalls(calls, 'chart.gettoptracks')[0] || {};
    check('Vietnam: geo.gettoptracks country=Viet Nam format=json limit=20 page=1 (env key)', v.country === 'Viet Nam' && v.format === 'json' && v.limit === '20' && v.page === '1' && v.api_key === 'TEST', JSON.stringify(v));
    check('Global: chart.gettoptracks format=json limit=20 page=1', g.format === 'json' && g.limit === '20' && g.page === '1' && !g.country, JSON.stringify(g));
    check('section titles', (await p.textContent(VN)).includes('Phổ biến tại Việt Nam') && (await p.textContent(GL)).includes('Thịnh hành toàn cầu'));
    check('20 songs per Home section', (await p.$$(`${VN} .reco-card`)).length === 20 && (await p.$$(`${GL} .reco-card`)).length === 20);
    const c1 = await p.$eval(`${VN} .reco-card >> nth=0`, (e) => e.textContent);
    check('card: rank, title, artist, listeners', c1.includes('#1') && c1.includes('Bài VN 1') && c1.includes('Ca sĩ 1') && c1.includes('người nghe'), c1);
    await p.waitForTimeout(400);
    const arts = await p.$$eval(`${VN} .reco-card`, (cs) => cs.slice(0, 3).map((c) => { const i = c.querySelector('img'); return i ? (i.complete && i.naturalWidth > 0 ? 'img' : 'broken') : (c.querySelector('svg.artwork') ? 'scene' : 'none'); }));
    check('artwork: chart image › album cover (track.getInfo) › fallback art, never broken', arts[0] === 'img' && arts[1] === 'img' && arts[2] === 'scene', arts.join(','));
    const info = chartCalls(calls, 'track.getinfo');
    check('album covers fetched only for cards on screen (not all 40)', info.length > 3 && info.length < 30 && info.every((c) => c.autocorrect === '1'), `${info.length}`);
    check('square album-art cards', await p.$eval(`${VN} .reco-card__thumb`, (e) => Math.abs(e.clientWidth - e.clientHeight) <= 1));
    check('no YouTube searches before a song is chosen', calls.yt.filter((c) => c.q).length === 0);

    // play → YouTube lookup → best upload
    await p.click(`${VN} .reco-card >> nth=0 >> .reco-card__main`);
    await p.waitForFunction(() => window.__loaded, null, { timeout: 5000 }).catch(() => {});
    const s = calls.yt.find((c) => c.q) || {};
    check('YouTube query = artist + title, Music category', s.q === 'Ca sĩ 1 - Bài VN 1' && s.videoCategoryId === '10', JSON.stringify(s));
    const loaded = await p.evaluate(() => window.__loaded);
    check('plays the Topic upload (not cover / remix / lyrics / MV)', videos.get(loaded)?.[1] === 'Ca sĩ 1 - Topic', JSON.stringify(videos.get(loaded)));
    await p.waitForTimeout(300);
    check('plays in the existing player', (await p.getAttribute('.play-btn', 'aria-label')) === 'Tạm dừng' && (await p.textContent('.player__title')).includes('Bài VN 1'));
    check('card marks the playing song', await p.$eval(`${VN} .reco-card >> nth=0`, (e) => e.classList.contains('is-current')));
    const nSearch = calls.yt.filter((c) => c.q).length;
    await p.click(`${VN} .reco-card >> nth=0 >> .reco-card__main`); await p.waitForTimeout(300);
    check('same song again: no second YouTube search (cached match)', calls.yt.filter((c) => c.q).length === nSearch);
    // global song
    await p.click(`${GL} .reco-card >> nth=1 >> .reco-card__main`); await p.waitForTimeout(600);
    check('global song plays too', videos.get(await p.evaluate(() => window.__loaded))?.[0] === 'Global Song 2');
    // no match → toast, player untouched
    const before = await p.evaluate(() => window.__loaded);
    await p.click(`${VN} .reco-card >> nth=2 >> .reco-card__main`); await p.waitForTimeout(700);
    check('no matching upload → message, nothing unrelated plays', /Không tìm thấy/.test(await p.textContent('.toast-stack')) && (await p.evaluate(() => window.__loaded)) === before);
    // queue an unresolved song
    await p.hover(`${VN} .reco-card >> nth=4`);
    await p.click(`${VN} .reco-card >> nth=4 >> button[aria-label^="Thêm"]`); await p.waitForTimeout(600);
    await p.keyboard.press('q'); await p.waitForTimeout(300);
    const qt = await p.$$eval('.queue__title', (e) => e.map((x) => x.textContent));
    check('"Thêm vào hàng đợi" looks the song up and queues it', qt.some((t) => t.includes('Bài VN 5')), qt.join(' | '));
    await p.keyboard.press('q');
    check('single YouTube player instance', (await p.evaluate(() => window.__players)) === 1);

    // See all + independent paging
    await p.click(`${VN} a:has-text("Xem tất cả")`);
    await p.waitForSelector('.chart-grid .reco-card:not(.reco-card--sk)');
    check('"Xem tất cả" → /charts/vietnam, page 1 from cache', p.url().endsWith('/charts/vietnam') && (await p.$$('.chart-grid .reco-card')).length === 20 && chartCalls(calls, 'geo.gettoptracks').length === 1);
    await p.click('button:has-text("Tải thêm bài hát")'); await p.waitForTimeout(600);
    const titles = await p.$$eval('.chart-grid .reco-card__title', (e) => e.map((x) => x.textContent));
    check('Load more → page 2; overlapping song shown once', titles.length === 39 && titles.filter((t) => t === 'Bài VN 1').length === 1 && chartCalls(calls, 'geo.gettoptracks').some((c) => c.page === '2'), `${titles.length}`);
    await p.evaluate(() => document.querySelector('.main__scroll').scrollTo(0, 1e6)); await p.waitForTimeout(800);
    check('scroll to bottom → last page, then no more button', (await p.$$('.chart-grid .reco-card:not(.reco-card--sk)')).length === 44 && !(await p.$('button:has-text("Tải thêm bài hát")')));
    check('Global not paged by the Vietnam list', chartCalls(calls, 'chart.gettoptracks').every((c) => c.page === '1'));
    await p.goto(URL0 + '/charts/global'); await p.waitForSelector('.chart-grid .reco-card:not(.reco-card--sk)');
    check('/charts/global: own list', (await p.textContent('h1')) === 'Thịnh hành toàn cầu' && (await p.$$('.chart-grid .reco-card')).length === 20);
    await p.click('button:has-text("Tải thêm bài hát")'); await p.waitForTimeout(600);
    check('Global load more → its page 2 only', (await p.$$('.chart-grid .reco-card:not(.reco-card--sk)')).length === 30 && chartCalls(calls, 'chart.gettoptracks').filter((c) => c.page === '2').length === 1);
    await p.click('.chart-grid .reco-card >> nth=25 >> .reco-card__main'); await p.waitForTimeout(600);
    check('playing from the full list works', videos.get(await p.evaluate(() => window.__loaded))?.[0] === 'Global Song 26');
    await p.goto(URL0 + '/charts/nope'); await p.waitForTimeout(400);
    check('unknown chart → Home', new URL(p.url()).pathname === '/');
    const nLast = calls.lastfm.length; await p.goto(URL0 + '/'); await p.waitForSelector(`${VN} .reco-card:not(.reco-card--sk)`);
    check('charts cached across reloads (no new Last.fm request)', calls.lastfm.filter((c) => c.method.toLowerCase() !== 'geo.gettopartists').length === nLast - calls.lastfm.slice(0, nLast).filter((c) => c.method.toLowerCase() === 'geo.gettopartists').length);
    check('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  // ---------- errors: one failing chart never breaks Home or the other chart ----------
  for (const [name, fail, re, wait] of [
    ['rate limit (29)', (r) => r.fulfill({ json: { error: 29, message: 'Rate Limit Exceeded' } }), /giới hạn/, 800],
    ['network failure', (r) => r.abort(), /kết nối/, 2500],
    ['timeout', () => {}, /quá chậm/, 24000],
  ]) {
    const { ctx, calls } = await context('desktop', (route, u) => (u.searchParams.get('method').toLowerCase() === 'chart.gettoptracks' ? fail(route) : chartOk(route, u)));
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(URL0 + '/');
    await p.waitForSelector(`${GL} .artists-error`, { timeout: wait + 4000 }).catch(() => {});
    const txt = (await p.$(`${GL} .artists-error`)) ? await p.textContent(`${GL} .artists-error`) : '';
    check(`Global ${name} → message + retry in its section`, re.test(txt) && (await p.isVisible(`${GL} .artists-error button`)), txt);
    check(`Global ${name}: Vietnam chart and Home unaffected`, (await p.$$(`${VN} .reco-card:not(.reco-card--sk)`)).length === 20 && (await p.isVisible('.mood-shelf')) && errs.length === 0);
    if (name === 'rate limit (29)') check('rate limit not retried', chartCalls(calls, 'chart.gettoptracks').length === 1);
    await ctx.close();
  }
  // empty chart → section hidden
  {
    const { ctx } = await context('desktop', (route, u) => (u.searchParams.get('method').toLowerCase() === 'chart.gettoptracks' ? route.fulfill({ json: { tracks: { track: [], '@attr': { totalPages: '0' } } } }) : chartOk(route, u)));
    const p = await ctx.newPage(); await p.goto(URL0 + '/'); await p.waitForSelector(`${VN} .reco-card:not(.reco-card--sk)`); await p.waitForTimeout(400);
    check('empty chart → section hidden on Home', !(await p.$(GL)));
    await p.goto(URL0 + '/charts/global'); await p.waitForTimeout(500);
    check('empty chart page → empty state', /Chưa có dữ liệu/.test(await p.textContent('.page')));
    await ctx.close();
  }
  // ---------- layouts ----------
  for (const [w, h, mode] of [[390, 844, 'desktop'], [800, 480, 'car'], [1024, 600, 'car'], [1920, 1080, 'desktop']]) {
    const { ctx, videos } = await context(mode, chartOk, { width: w, height: h });
    const p = await ctx.newPage();
    for (const path of ['/', '/charts/vietnam', '/charts/global']) {
      await p.goto(URL0 + path); await p.waitForTimeout(900);
      const m = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth, cards: document.querySelectorAll('.reco-card:not(.reco-card--sk)').length }));
      check(`${w}×${h} ${mode} ${path}: cards shown, no horizontal overflow`, !m.over && m.cards >= 20, JSON.stringify(m));
    }
    if (mode === 'car') {
      const box = await p.$eval('.chart-grid .reco-card__main', (e) => e.getBoundingClientRect().height);
      await p.click('.chart-grid .reco-card >> nth=0 >> .reco-card__main'); await p.waitForTimeout(600);
      check(`${w}×${h} Car View: tap target ≥ 44px, tap plays`, box >= 44 && videos.get(await p.evaluate(() => window.__loaded))?.[1]?.endsWith('Topic'));
    }
    await ctx.close();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  await b.close();
})();
