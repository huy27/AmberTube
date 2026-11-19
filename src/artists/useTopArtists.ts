import type { Artist } from '../types';
import { getTopArtists } from '../services/lastfm';
import { usePaged } from '../lastfm/usePaged';
import { mergeArtists } from './normalize';

const fetchArtists = (page: number, limit: number) => getTopArtists({ page, limit }).then((r) => ({ items: r.artists, totalPages: r.totalPages }));

/** Popular artists in Vietnam, `pageSize` per page, with "load more". */
export function useTopArtists(pageSize = 20) {
  const p = usePaged<Artist>(fetchArtists, mergeArtists, pageSize, 'Không tải được danh sách nghệ sĩ.');
  return { ...p, artists: p.items };
}
