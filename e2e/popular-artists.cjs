// "Nghệ sĩ nổi bật tại Việt Nam": Last.fm geo.getTopArtists (mocked) + YouTube search for an artist (mocked).
// Needs the API build:  VITE_YOUTUBE_API_KEY=TEST VITE_LASTFM_API_KEY=TEST npx vite build --outDir /tmp/dist-api
const { chromium } = require('playwright');
const URL0 = process.env.AMBERTUBE_API_URL || 'http://localhost:4174';
const TOTAL = 45;
const mbidOf = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const SVG = (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="${c}"/></svg>`;
const lastfmArtist = (i) => ({
  name: i === 1 ? 'Sơn Tùng M-TP' : `Nghệ sĩ ${i}`, mbid: i % 3 ? mbidOf(i) : '', url: `https://www.last.fm/music/a${i}`,
  listeners: i === 4 ? '' : String(500000 - i * 1000), playcount: String(9000000 - i * 1000),
  // 1: real photo · 2: Last.fm placeholder star · 3: broken URL · others: no image
  image: i === 1 ? [{ '#text': 'https://img.test/real.jpg', size: 'extralarge' }] : i === 2 ? [{ '#text': 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png', size: 'extralarge' }] : i === 3 ? [{ '#text': 'https://img.test/404.jpg', size: 'extralarge' }] : [{ '#text': '', size: 'large' }],
  '@attr': { rank: String(i) },
});
const vids = Array.from({ length: 8 }, (_, k) => [`st${k}aaaaaaaa`.slice(0, 11), `Sơn Tùng M-TP - Bài ${k + 1} (Official Audio)`, 'Sơn Tùng M-TP', 200 + k]);
const other = [];
const resource = ([id, title, ch, dur]) => ({ id, snippet: { title, channelTitle: ch, channelId: `UC${ch.length}x`, liveBroadcastContent: 'none', thumbnails: {}, categoryId: '10' }, contentDetails: { duration: `PT${Math.floor(dur / 60)}M${dur % 60}S` }, statistics: { viewCount: '100000' }, status: { license: 'youtube' } });
(async () => {
  const b = await chromium.launch();
  let fails = 0;
  const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fails++; };
  async function context(mode, lastfm, viewport = { width: 1360, height: 860 }) {
    const ctx = await b.newContext({ viewport, hasTouch: viewport.width < 1024 });
    const calls = { lastfm: [], yt: [], wd: [], sparql: [] };
    // Wikidata: #2 (MusicBrainz id) has a photo; #6 (no id) is found by exact name — a same-named gene is ignored
    await ctx.route('https://www.wikidata.org/**', (route) => {
      const u = new URL(route.request().url()); calls.wd.push(u.searchParams.get('search'));
      const s = u.searchParams.get('search');
      return route.fulfill({ json: { search: s === 'Nghệ sĩ 6' ? [{ id: 'Q900', label: 'NS6 gene', match: { text: 'Nghệ sĩ 6' } }, { id: 'Q606', label: 'Nghệ sĩ 6' }] : [] } });
    });
    await ctx.route('https://query.wikidata.org/**', (route) => {
      const q = new URL(route.request().url()).searchParams.get('query'); calls.sparql.push(q);
      const file = (n) => ({ type: 'uri', value: `http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(n)}` });
      if (q.includes('wdt:P434 ?mbid')) return route.fulfill({ json: { results: { bindings: [...q.matchAll(/"([0-9a-f-]{36})"/g)].map((m) => m[1]).filter((id) => ['2', '4'].includes(String(Number(id.slice(-12))))).map((id) => ({ mbid: { value: id }, ...(id.endsWith('2') ? { img: file('Nghe si 2.jpg') } : {}) })) } } });
      return route.fulfill({ json: { results: { bindings: [
        { item: { value: 'http://www.wikidata.org/entity/Q606' }, img: file('Nghe si 6.jpg'), music: { value: 'true' }, vn: { value: 'true' } },
        { item: { value: 'http://www.wikidata.org/entity/Q900' }, img: file('Gene.jpg'), music: { value: 'false' }, vn: { value: 'false' } },
      ] } } });
    });
    await ctx.route('https://commons.wikimedia.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG(r.request().url().includes('Gene') ? '#f00' : '#0a0') }));
    await ctx.route('https://yt3.test/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG('#00f') }));
    await ctx.route('https://ws.audioscrobbler.com/**', (route) => {
      const u = new URL(route.request().url());
      // the song charts on Home are covered by popular-charts.cjs; here they are simply empty
      if (u.searchParams.get('method').toLowerCase() !== 'geo.gettopartists') return route.fulfill({ json: { tracks: { track: [], '@attr': { totalPages: '0' } } } });
      calls.lastfm.push(Object.fromEntries(u.searchParams));
      if (u.searchParams.get('country') !== 'Viet Nam') return route.fulfill({ json: { error: 6, message: 'country param invalid', links: [] } });
      return lastfm(route, u);
    });
    await ctx.route('https://img.test/real.jpg', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#c80"/></svg>' }));
    await ctx.route('https://img.test/404.jpg', (r) => r.fulfill({ status: 404, body: '' }));
    await ctx.route('https://lastfm.freetls.fastly.net/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: '' }));
    await ctx.route('https://i.ytimg.com/**', (r) => r.abort());
    await ctx.route('https://www.googleapis.com/youtube/v3/**', (route) => {
      const u = new URL(route.request().url()); calls.yt.push(Object.fromEntries(u.searchParams));
      if (u.pathname.endsWith('/search')) {
        const q = u.searchParams.get('q');
        if (q !== 'Sơn Tùng M-TP') { other.length = 0; other.push([`ot${q.length}aaaaaaaaa`.slice(0, 11), `${q} - Một Bài (Official Audio)`, `${q} - Topic`, 210]); return route.fulfill({ json: { items: other.map(([id]) => ({ id: { videoId: id } })) } }); }
        return route.fulfill({ json: { items: vids.map(([id]) => ({ id: { videoId: id } })) } });
      }
      if (u.pathname.endsWith('/channels')) return route.fulfill({ json: { items: [{ id: u.searchParams.get('id'), snippet: { thumbnails: { medium: { url: 'https://yt3.test/avatar.jpg' } } } }] } });
      if (u.searchParams.get('chart')) return route.fulfill({ json: { items: [] } });
      const ids = (u.searchParams.get('id') || '').split(',');
      return route.fulfill({ json: { items: [...vids, ...other].filter(([id]) => ids.includes(id)).map(resource) } });
    });
    await ctx.addInitScript((m) => {
      if (!sessionStorage.getItem('i')) { localStorage.clear(); localStorage.setItem('ambertube:display-mode', m); localStorage.setItem('ambertube:car-suggest-dismissed', '1'); sessionStorage.setItem('i', '1'); }
      class Player { constructor(el, o) { window.__players = (window.__players || 0) + 1; this.o = o; setTimeout(() => o.events.onReady({ target: this }), 10); }
        _s(s) { this.state = s; this.o.events.onStateChange({ target: this, data: s }); }
        loadVideoById({ videoId }) { this.vid = videoId; window.__loaded = videoId; setTimeout(() => { this.since = performance.now(); this._s(1); }, 20); }
        cueVideoById() { this._s(5); } playVideo() { this._s(1); } pauseVideo() { this._s(2); } stopVideo() {} seekTo() {}
        getCurrentTime() { return this.since ? (performance.now() - this.since) / 1000 : 0; } getDuration() { return 200; } getPlayerState() { return this.state ?? -1; }
        setVolume() {} mute() {} unMute() {} setPlaybackRate() {} getPlaybackRate() { return 1; } getAvailablePlaybackRates() { return [1]; } getVideoData() { return {}; } }
      window.YT = { Player };
    }, mode);
    return { ctx, calls };
  }
  const ok = (route, u) => {
    const page = Number(u.searchParams.get('page')), limit = Number(u.searchParams.get('limit'));
    const from = (page - 1) * limit + 1, to = Math.min(TOTAL, page * limit);
    const artist = []; for (let i = from; i <= to; i++) artist.push(lastfmArtist(i));
    return route.fulfill({ json: { topartists: { artist, '@attr': { country: 'Viet Nam', page: String(page), perPage: String(limit), totalPages: String(Math.ceil(TOTAL / limit)), total: String(TOTAL) } } } });
  };

  // ---------- happy path (desktop) ----------
  {
    const { ctx, calls } = await context('desktop', ok);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(URL0 + '/');
    await p.waitForSelector('#sh-artists'); await p.waitForSelector('.artist-card:not(.artist-card--sk)');
    const q = calls.lastfm[0] || {};
    check('Last.fm request: geo.gettopartists, country=Viet Nam, json, limit 20, page 1', q.method?.toLowerCase() === 'geo.gettopartists' && q.country === 'Viet Nam' && q.format === 'json' && q.limit === '20' && q.page === '1' && q.api_key === 'TEST', JSON.stringify(q));
    const first = await p.$eval('.artist-card', (e) => e.textContent);
    check('Home shelf: rank, name, listeners', /^1Sơn Tùng M-TP499 N người nghe$/.test(first.replace(/\s+/g, ' ').replace(/ /g, '')) || (first.includes('Sơn Tùng M-TP') && first.includes('người nghe') && first.trim().startsWith('1')), first);
    check('Home shows the first 20', (await p.$$('#sh-artists ~ * .artist-card, .shelf:has(#sh-artists) .artist-card')).length === 20);
    await p.waitForTimeout(600);
    await p.waitForTimeout(600);
    const imgs = await p.$$eval('.shelf:has(#sh-artists) .artist-card', (cards) => cards.slice(0, 7).map((c) => { const img = c.querySelector('img'); return img ? (img.complete && img.naturalWidth > 0 ? (img.src.includes('commons') ? 'wiki' : 'img') : 'broken') : (c.querySelector('.artist-avatar--mono') ? 'mono' : 'none'); }));
    check('images: Last.fm photo › Wikimedia (MusicBrainz id or exact-name musician) › monogram; never broken', imgs.join(',') === 'img,wiki,mono,mono,mono,wiki,mono', imgs.join(','));
    check('Wikimedia photo is the musician, not the same-named entity', await p.$eval('.shelf:has(#sh-artists) .artist-card >> nth=5', (c) => !c.querySelector('img').src.includes('Gene') && c.querySelector('img').title === 'Ảnh: Wikimedia Commons'));
    check('Wikidata looked up in one batch (≤ 2 SPARQL queries), name search only for artists without an id', calls.sparql.length <= 2 && calls.wd.every((n) => !/^Nghệ sĩ (2|4)$/.test(n)) && calls.wd.includes('Nghệ sĩ 6'), `${calls.sparql.length} sparql · ${calls.wd.join(',')}`);
    check('listeners missing → no count shown (not "0")', !(await p.$eval('.shelf:has(#sh-artists) .artist-card >> nth=3', (e) => e.textContent)).includes('người nghe'));
    // See all → paging
    await p.click('.shelf:has(#sh-artists) a:has-text("Xem tất cả")');
    await p.waitForSelector('.artist-grid .artist-card:not(.artist-card--sk)');
    check('"Xem tất cả" opens the full list (page 1 served from cache, no 2nd request)', (await p.$$('.artist-grid .artist-card')).length === 20 && calls.lastfm.filter((c) => c.page === '1').length === 1, `${calls.lastfm.length} requests`);
    await p.click('button:has-text("Tải thêm nghệ sĩ")'); await p.waitForTimeout(500);
    check('Load more → page 2 (40 artists, no duplicates)', (await p.$$('.artist-grid .artist-card:not(.artist-card--sk)')).length === 40 && calls.lastfm.some((c) => c.page === '2' && c.limit === '20'));
    await p.evaluate(() => document.querySelector('.main__scroll').scrollTo(0, 1e6)); await p.waitForTimeout(800);
    const n = (await p.$$('.artist-grid .artist-card:not(.artist-card--sk)')).length;
    check('scrolling to the bottom loads the last page; then no more button', n === TOTAL && !(await p.$('button:has-text("Tải thêm nghệ sĩ")')), `${n}`);
    check('each page requested once', ['1', '2', '3'].every((pg) => calls.lastfm.filter((c) => c.page === pg).length === 1), calls.lastfm.map((c) => c.page).join(','));
    // artist → YouTube songs → play / queue
    await p.evaluate(() => document.querySelector('.main__scroll').scrollTo(0, 0));
    await p.click('.artist-grid .artist-card >> nth=0');
    await p.waitForSelector('.artist-hero'); await p.waitForSelector('.video-row');
    const s = calls.yt.find((c) => c.q) || {};
    check('artist page searches YouTube for the artist (Music category)', s.q === 'Sơn Tùng M-TP' && s.videoCategoryId === '10', JSON.stringify(s));
    check('artist page shows rank + listeners from the chart', /#1 tại Việt Nam/.test(await p.textContent('.artist-hero')) && /người nghe/.test(await p.textContent('.artist-hero')));
    await p.click('.video-row >> nth=0'); await p.waitForTimeout(500);
    check('clicking a song plays it in the existing player', (await p.textContent('.player__title')) === 'Sơn Tùng M-TP - Bài 1 (Official Audio)' && (await p.getAttribute('.play-btn', 'aria-label')) === 'Tạm dừng');
    await p.click('.video-row >> nth=2 >> .video-row__queue'); await p.keyboard.press('q'); await p.waitForTimeout(300);
    check('"Thêm vào hàng đợi" adds it to the queue', (await p.$$eval('.queue__title', (e) => e.map((x) => x.textContent))).includes('Sơn Tùng M-TP - Bài 3 (Official Audio)'));
    check('single YouTube player instance', (await p.evaluate(() => window.__players)) === 1);
    // an artist with no photo anywhere: its page uses the YouTube channel picture, and Home remembers it
    await p.goto(URL0 + '/artist/' + encodeURIComponent('Nghệ sĩ 4')); await p.waitForSelector('.video-row'); await p.waitForTimeout(800);
    check('no Wikimedia photo → artist page uses the YouTube channel picture (channels.list) with credit',
      (await p.$eval('.artist-hero .artist-avatar img', (i) => i.src).catch(() => '')).includes('yt3.test') && /Ảnh: YouTube/.test(await p.textContent('.artist-hero')) && calls.yt.some((c) => c.part === 'snippet' && c.id === 'UC17x'));
    // reload: served from cache (6–12 h), no new Last.fm call
    const before = calls.lastfm.length; await p.goto(URL0 + '/'); await p.waitForSelector('.shelf:has(#sh-artists) .artist-card:not(.artist-card--sk)');
    check('cached across reloads (no new request)', calls.lastfm.length === before);
    await p.waitForTimeout(500);
    check('Home now shows that channel picture for the artist', (await p.$eval('.shelf:has(#sh-artists) .artist-card >> nth=3', (c) => c.querySelector('img')?.src || '')).includes('yt3.test'));
    check('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  // ---------- errors ----------
  for (const [name, handler, re] of [
    ['rate limit (error 29)', (r) => r.fulfill({ status: 200, json: { error: 29, message: 'Rate Limit Exceeded' } }), /giới hạn/],
    ['invalid key (error 10)', (r) => r.fulfill({ status: 200, json: { error: 10, message: 'Invalid API key' } }), /API key/],
    ['network failure', (r) => r.abort(), /mạng/],
  ]) {
    const { ctx, calls } = await context('desktop', handler);
    const p = await ctx.newPage();
    await p.goto(URL0 + '/'); await p.waitForSelector('.artists-error', { timeout: 8000 }).catch(() => {});
    const txt = (await p.$('.artists-error')) ? await p.textContent('.artists-error') : '';
    check(`Home: ${name} → clear message + retry`, re.test(txt) && (await p.isVisible('.artists-error button')), txt);
    if (name === 'rate limit (error 29)') check('rate limit is not retried automatically', calls.lastfm.length === 1, `${calls.lastfm.length}`);
    await p.goto(URL0 + '/artists'); await p.waitForTimeout(name === 'network failure' ? 2500 : 600);
    check(`/artists: ${name} → error state`, re.test(await p.textContent('.empty')));
    await ctx.close();
  }
  // ---------- layouts ----------
  for (const [w, h, mode] of [[390, 844, 'desktop'], [800, 480, 'car'], [1024, 600, 'car']]) {
    const { ctx } = await context(mode, ok, { width: w, height: h });
    const p = await ctx.newPage();
    for (const path of ['/', '/artists', '/artist/S%C6%A1n%20T%C3%B9ng%20M-TP']) {
      await p.goto(URL0 + path); await p.waitForTimeout(900);
      const m = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth, cards: document.querySelectorAll('.artist-card').length }));
      check(`${w}×${h} ${mode} ${path}: no horizontal overflow`, !m.over);
    }
    await ctx.close();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  await b.close();
})();
