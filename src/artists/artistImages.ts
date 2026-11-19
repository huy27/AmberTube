// Where artist pictures come from, in order: Last.fm (when real) › Wikimedia Commons (via Wikidata)
// › the artist's YouTube channel picture (learned on the artist page) › a monogram.
import { createImageStore, type ImageRef } from '../lastfm/imageStore';
import { normalize } from '../search/normalize';
import { commonsFile, commonsPage, commonsThumb, pickEntity, type WdCandidate, type WdFacts } from './wikidata';

const WD_API = 'https://www.wikidata.org/w/api.php';
const SPARQL = 'https://query.wikidata.org/sparql';
const TIMEOUT = 12_000;
const MUSIC_IDS = 'wdt:P434|wdt:P1902|wdt:P2850|wdt:P1953'; // MusicBrainz / Spotify / Apple Music / Discogs artist IDs

export interface ArtistReq { name: string; mbid: string | null }

async function getJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/sparql-results+json, application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}
type Bindings = { results: { bindings: Record<string, { value: string } | undefined>[] } };
const sparql = (q: string) => getJson<Bindings>(`${SPARQL}?format=json&query=${encodeURIComponent(q)}`).then((r) => r.results.bindings);
const qid = (uri: string) => uri.split('/').pop()!;
const toRef = (p18: string | undefined): ImageRef | null => {
  if (!p18) return null;
  const file = commonsFile(p18);
  return { url: commonsThumb(file), credit: { label: 'Wikimedia Commons', href: commonsPage(file) } };
};

async function loadBatch(reqs: ArtistReq[]): Promise<Map<string, ImageRef | null>> {
  const out = new Map<string, ImageRef | null>();
  const key = (r: ArtistReq) => normalize(r.name);

  // 1. MusicBrainz IDs → entity, one query for the whole batch
  const withMbid = reqs.filter((r) => r.mbid && /^[0-9a-f-]{36}$/i.test(r.mbid));
  const found = new Set<string>();
  if (withMbid.length) {
    const rows = await sparql(`SELECT ?mbid ?img WHERE { VALUES ?mbid { ${withMbid.map((r) => `"${r.mbid}"`).join(' ')} } ?item wdt:P434 ?mbid . OPTIONAL { ?item wdt:P18 ?img } }`);
    for (const row of rows) {
      const r = withMbid.find((x) => x.mbid === row.mbid?.value);
      if (!r) continue;
      found.add(key(r));
      if (!out.get(key(r))) out.set(key(r), toRef(row.img?.value));
    }
  }

  // 2. the rest by exact name, keeping only musicians / music groups
  const rest = reqs.filter((r) => !found.has(key(r)));
  if (!rest.length) return out;
  const cands = new Map<string, WdCandidate[]>();
  for (let i = 0; i < rest.length; i += 4) { // 4 searches at a time
    await Promise.all(rest.slice(i, i + 4).map(async (r) => {
      const s = await getJson<{ search?: { id: string; label?: string; match?: { text?: string } }[] }>(
        `${WD_API}?action=wbsearchentities&search=${encodeURIComponent(r.name)}&language=vi&uselang=vi&type=item&limit=7&format=json&origin=*`);
      cands.set(key(r), (s.search ?? []).map((c) => ({ id: c.id, label: c.label, match: c.match?.text })));
    }));
  }
  const ids = [...new Set([...cands.values()].flat().map((c) => c.id))].filter((id) => /^Q\d+$/.test(id));
  if (!ids.length) return out;
  const rows = await sparql(`SELECT ?item (SAMPLE(?i) AS ?img) (MAX(?m) AS ?music) (MAX(?v) AS ?vn) WHERE {
    VALUES ?item { ${ids.map((i) => `wd:${i}`).join(' ')} }
    OPTIONAL { ?item wdt:P18 ?i }
    BIND(EXISTS { ?item ${MUSIC_IDS} [] } || EXISTS { ?item wdt:P106/wdt:P279* wd:Q639669 } || EXISTS { ?item wdt:P31/wdt:P279* wd:Q215380 } AS ?m)
    BIND(EXISTS { ?item wdt:P27|wdt:P495 wd:Q881 } AS ?v)
  } GROUP BY ?item`);
  const facts: Record<string, WdFacts> = {};
  for (const row of rows) facts[qid(row.item!.value)] = { music: row.music?.value === 'true', vn: row.vn?.value === 'true', image: row.img?.value ?? null };
  for (const r of rest) {
    const id = pickEntity(r.name, cands.get(key(r)) ?? [], facts);
    out.set(key(r), id ? toRef(facts[id].image ?? undefined) : null);
  }
  return out;
}

export const artistImages = createImageStore<ArtistReq>({
  storageKey: 'ambertube:artist-img:v1',
  keyOf: (r) => normalize(r.name),
  load: loadBatch,
  hitTtl: 30 * 24 * 3600_000,
  missTtl: 3 * 24 * 3600_000,
  batchSize: 20,
  concurrency: 1,
});
