// Small persistent image lookup store: batched, rate-limited, cached in localStorage, subscribable from React.
import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';

export interface ImageRef {
  url: string;
  /** Where the picture comes from, for attribution (e.g. a Wikimedia Commons file page). */
  credit?: { label: string; href: string };
}
type Entry = { at: number; img: ImageRef | null };

export interface ImageStore<Req> {
  /** Known result: an image, null (looked up, none exists) or undefined (not looked up yet / expired). */
  get(key: string): ImageRef | null | undefined;
  set(key: string, img: ImageRef | null): void;
  request(req: Req): void;
  subscribe(cb: () => void): () => void;
  keyOf(req: Req): string;
}

export function createImageStore<Req>(opts: {
  storageKey: string;
  keyOf: (req: Req) => string;
  /** Resolve a batch; keys missing from the result map are treated as "no image". Throwing = try again later. */
  load: (reqs: Req[]) => Promise<Map<string, ImageRef | null>>;
  hitTtl: number;
  missTtl: number;
  max?: number;
  batchSize?: number;
  concurrency?: number;
}): ImageStore<Req> {
  const { storageKey, keyOf, load, hitTtl, missTtl, max = 400, batchSize = 1, concurrency = 2 } = opts;
  let data: Record<string, Entry> | null = null;
  const listeners = new Set<() => void>();
  const queue = new Map<string, Req>();
  const busy = new Set<string>(); // queued or in flight
  const failed = new Set<string>(); // failed this session: don't hammer a service that is down
  let running = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const read = () => {
    if (data) return data;
    try {
      data = JSON.parse(localStorage.getItem(storageKey) || '{}') as Record<string, Entry>;
    } catch {
      data = {};
    }
    return data;
  };
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const persist = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const d = read();
      const keys = Object.keys(d);
      if (keys.length > max) keys.sort((a, b) => d[a].at - d[b].at).slice(0, keys.length - max).forEach((k) => delete d[k]);
      try {
        localStorage.setItem(storageKey, JSON.stringify(d));
      } catch {
        /* storage full: memory only */
      }
    }, 300);
  };
  const notify = () => listeners.forEach((l) => l());

  const get = (key: string) => {
    const e = read()[key];
    if (!e || Date.now() - e.at > (e.img ? hitTtl : missTtl)) return undefined;
    return e.img;
  };
  const set = (key: string, img: ImageRef | null) => {
    read()[key] = { at: Date.now(), img };
    persist();
    notify();
  };

  const pump = () => {
    while (running < concurrency && queue.size) {
      const batch = [...queue.entries()].slice(0, batchSize);
      batch.forEach(([k]) => queue.delete(k));
      running++;
      load(batch.map(([, r]) => r))
        .then((res) => {
          const d = read();
          const now = Date.now();
          for (const [k] of batch) d[k] = { at: now, img: res.get(k) ?? null };
          persist();
        })
        .catch(() => batch.forEach(([k]) => failed.add(k)))
        .finally(() => {
          batch.forEach(([k]) => busy.delete(k));
          running--;
          notify();
          pump();
        });
    }
  };

  return {
    get, set, keyOf,
    request(req) {
      const k = keyOf(req);
      if (get(k) !== undefined || busy.has(k) || failed.has(k)) return;
      busy.add(k);
      queue.set(k, req);
      if (!timer) timer = setTimeout(() => { timer = null; pump(); }, 40); // gather a batch
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

/**
 * The image for `req` from `store`, looked up once the element in `ref` is near the viewport
 * (so off-screen cards in a long shelf cost no requests). Pass `req = null` to skip the lookup.
 */
export function useStoreImage<Req>(store: ImageStore<Req>, req: Req | null, ref?: RefObject<Element>): ImageRef | null | undefined {
  const key = req ? store.keyOf(req) : '';
  const img = useSyncExternalStore(store.subscribe, () => (key ? store.get(key) : null), () => undefined);
  const reqRef = useRef(req);
  reqRef.current = req;
  useEffect(() => {
    if (!key || store.get(key) !== undefined) return;
    const el = ref?.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      store.request(reqRef.current!);
      return;
    }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        store.request(reqRef.current!);
      }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [key, store, ref]);
  return img;
}
