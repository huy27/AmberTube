// MP3 conversion is limited to media the user is authorised to download:
//   • demo tracks licensed 'owned' or 'cc-by'
//   • YouTube videos from channels listed in VITE_AUTHORIZED_CHANNEL_IDS / Settings,
//     converted by your own backend at VITE_CONVERSION_ENDPOINT.
// Everything else is refused with an explanation instead of being converted.
import type { Track } from '../types';

const ENDPOINT = (import.meta.env.VITE_CONVERSION_ENDPOINT || '').replace(/\/$/, '');
const AUTHORIZED_CHANNELS = new Set(
  (import.meta.env.VITE_AUTHORIZED_CHANNEL_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
);

export const hasConversionBackend = Boolean(ENDPOINT);
export const authorizedChannelCount = AUTHORIZED_CHANNELS.size;

export type Eligibility = { ok: true } | { ok: false; reason: string };

export function downloadEligibility(track: Track, extraChannels: string[] = []): Eligibility {
  if (track.provider === 'local') return { ok: false, reason: 'File này đã có sẵn trên máy bạn.' };
  if (track.provider === 'demo') {
    return track.license === 'standard' || track.unavailable
      ? { ok: false, reason: 'Chủ sở hữu bản quyền chưa cho phép tải bài này.' }
      : { ok: true };
  }
  if (!track.channelId || !(AUTHORIZED_CHANNELS.has(track.channelId) || extraChannels.includes(track.channelId))) {
    return { ok: false, reason: 'Chỉ chuyển MP3 được cho kênh bạn sở hữu hoặc có quyền. Thêm kênh trong Cài đặt › Tải xuống.' };
  }
  if (!ENDPOINT) return { ok: false, reason: 'Chưa cấu hình backend chuyển đổi (VITE_CONVERSION_ENDPOINT).' };
  return { ok: true };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('Cancelled', 'AbortError'));
    });
  });

interface ConversionOptions {
  bitrate?: number;
  authorizedChannels?: string[];
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
}

/**
 * Runs a conversion job. Resolves to { url, fileName } (url is null for simulated demo jobs).
 * Backend contract: POST {ENDPOINT}/jobs -> { id }; GET {ENDPOINT}/jobs/:id -> { status, progress, downloadUrl, error }.
 */
export async function runConversion(track: Track, opts: ConversionOptions = {}): Promise<{ url: string | null; fileName: string }> {
  const { bitrate = 192, authorizedChannels = [], onProgress, signal } = opts;
  const check = downloadEligibility(track, authorizedChannels);
  if (!check.ok) throw new Error(check.reason);
  const fileName = `${track.title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 80)}.mp3`;

  if (track.provider === 'demo') {
    for (let p = 0; p <= 100; p += 4 + Math.random() * 8) {
      onProgress?.(Math.min(99, Math.round(p)));
      await sleep(140, signal);
    }
    onProgress?.(100);
    return { url: null, fileName };
  }

  const res = await fetch(`${ENDPOINT}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: track.provider, sourceId: track.videoId, channelId: track.channelId, bitrate, title: track.title }),
    signal,
  });
  if (!res.ok) throw new Error(`Gửi yêu cầu chuyển đổi thất bại (${res.status})`);
  const { id } = (await res.json()) as { id: string };

  for (;;) {
    await sleep(1000, signal);
    const poll = await fetch(`${ENDPOINT}/jobs/${encodeURIComponent(id)}`, { signal });
    if (!poll.ok) throw new Error(`Không kiểm tra được trạng thái chuyển đổi (${poll.status})`);
    const job = (await poll.json()) as { status: string; progress?: number; downloadUrl?: string; error?: string };
    if (job.status === 'error') throw new Error(job.error || 'Chuyển đổi thất bại');
    onProgress?.(Math.round(job.progress ?? 0));
    if (job.status === 'done') return { url: job.downloadUrl ?? null, fileName };
  }
}
