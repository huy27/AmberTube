// Album covers for chart songs (Last.fm track.getInfo), looked up only for cards that scroll into view,
// 3 at a time, cached two weeks — so a Home visit costs a handful of Last.fm calls, and none on repeat visits.
import type { ChartTrack } from '../types';
import { getTrackArt } from '../services/lastfm';
import { createImageStore } from '../lastfm/imageStore';

export const trackArt = createImageStore<Pick<ChartTrack, 'key' | 'artist' | 'title'>>({
  storageKey: 'ambertube:track-art:v1',
  keyOf: (c) => c.key,
  load: async ([c]) => {
    const url = await getTrackArt(c.artist, c.title);
    return new Map([[c.key, url ? { url } : null]]);
  },
  hitTtl: 14 * 24 * 3600_000,
  missTtl: 2 * 24 * 3600_000,
  max: 600,
  batchSize: 1,
  concurrency: 3,
});
