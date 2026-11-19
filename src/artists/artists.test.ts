import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeArtists, normalizeArtist, normalizeTopArtists, pickImage } from './normalize.ts';

const PH = 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';

test('normalizes a Last.fm geo.getTopArtists page', () => {
  const r = normalizeTopArtists({
    topartists: {
      artist: [
        { name: 'Sơn Tùng M-TP', mbid: 'abc', url: 'https://www.last.fm/music/S%C6%A1n+T%C3%B9ng+M-TP', listeners: '123456', playcount: '9876543', image: [{ '#text': 'https://x/a-small.jpg', size: 'small' }, { '#text': 'https://x/a-xl.jpg', size: 'extralarge' }], '@attr': { rank: '1' } },
        { name: 'Đen', listeners: 'abc', image: [{ '#text': PH, size: 'extralarge' }], '@attr': { rank: '2' } },
        { name: '  ', listeners: '1' },
      ],
      '@attr': { page: '1', perPage: '20', totalPages: '5', total: '100', country: 'Vietnam' },
    },
  }, 1, 20);
  assert.equal(r.artists.length, 2, 'entries without a name are dropped');
  assert.deepEqual(r.artists[0], { name: 'Sơn Tùng M-TP', mbid: 'abc', url: 'https://www.last.fm/music/S%C6%A1n+T%C3%B9ng+M-TP', image: 'https://x/a-xl.jpg', listeners: 123456, playcount: 9876543, rank: 1 });
  assert.equal(r.artists[1].image, null, 'the Last.fm grey-star placeholder is not an artist photo');
  assert.equal(r.artists[1].listeners, null, 'invalid numbers become null, not 0');
  assert.equal(r.artists[1].mbid, null);
  assert.equal(r.totalPages, 5);
});

test('missing fields are safe; rank falls back to the position on the page', () => {
  const a = normalizeArtist({ name: 'Mỹ Tâm' }, 41)!;
  assert.deepEqual(a, { name: 'Mỹ Tâm', mbid: null, url: null, image: null, listeners: null, playcount: null, rank: 41 });
  assert.equal(pickImage(undefined), null);
  assert.equal(pickImage([{ '#text': '', size: 'large' }]), null);
  assert.equal(pickImage([{ '#text': 'http://insecure/x.jpg', size: 'large' }]), null, 'only https images (no mixed content)');
  const single = normalizeTopArtists({ topartists: { artist: { name: 'Solo' } } }, 3, 20);
  assert.equal(single.artists[0].rank, 41, 'a single object (not array) is handled; rank = offset + 1');
  assert.deepEqual(normalizeTopArtists({}, 1, 20).artists, []);
});

test('pages are merged without duplicates', () => {
  const p1 = [normalizeArtist({ name: 'A' }, 1)!, normalizeArtist({ name: 'B' }, 2)!];
  const p2 = [normalizeArtist({ name: 'b' }, 3)!, normalizeArtist({ name: 'C' }, 4)!];
  assert.deepEqual(mergeArtists(p1, p2).map((a) => a.name), ['A', 'B', 'C']);
});

import { commonsFile, commonsPage, commonsThumb, pickEntity } from './wikidata.ts';

test('Wikidata photo: exact-name musician only; ambiguous → Vietnamese one, else none', () => {
  const facts = {
    Q1: { music: true, vn: true, image: 'x' }, Q2: { music: true, vn: false, image: 'y' },
    Q3: { music: false, vn: true, image: 'z' }, Q4: { music: true, vn: false, image: 'w' }, Q5: { music: true, vn: false, image: null },
  };
  // "Grey D": the voice actress "Grey DeLisle" is a musician too, but not an exact name
  assert.equal(pickEntity('Grey D', [{ id: 'Q4', label: 'Grey DeLisle' }, { id: 'Q1', label: 'Grey D' }], facts), 'Q1');
  // "SooBin": a Korean and a Vietnamese singer → the Vietnamese one; the Biblical "Simeon" (alias Soobin) is no musician
  assert.equal(pickEntity('SooBin', [{ id: 'Q3', label: 'Simeon', match: 'Soobin' }, { id: 'Q2', label: 'Soobin' }, { id: 'Q1', label: 'Soobin' }], facts), 'Q1');
  assert.equal(pickEntity('Soobin', [{ id: 'Q2', label: 'Soobin' }, { id: 'Q4', label: 'Soobin' }], facts), null, 'two foreign namesakes: no guess');
  assert.equal(pickEntity('Osad', [{ id: 'Q3', label: 'OMD', match: 'OSAD' }], facts), null, 'a gene called OSAD is not the rapper');
  assert.equal(pickEntity('Hoàng Dũng', [{ id: 'Q5', label: 'Hoàng Dũng' }], facts), 'Q5', 'diacritics/case-insensitive');
  assert.equal(pickEntity('Nobody', [], facts), null);
});

test('Commons helpers', () => {
  const f = commonsFile('http://commons.wikimedia.org/wiki/Special:FilePath/Son%20Tung%20M-TP%201%20%282017%29.png');
  assert.equal(f, 'Son Tung M-TP 1 (2017).png');
  assert.equal(commonsThumb(f), 'https://commons.wikimedia.org/wiki/Special:FilePath/Son%20Tung%20M-TP%201%20(2017).png?width=320');
  assert.equal(commonsPage(f), 'https://commons.wikimedia.org/wiki/File:Son_Tung_M-TP_1_(2017).png');
});
