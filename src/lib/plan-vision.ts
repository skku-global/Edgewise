/**
 * Read a trade plan (pair, direction, entry, stop loss, take profit, lots) from
 * one or SEVERAL screenshots sent together.
 *
 * Several images go in ONE request, so the model can combine views of the same
 * trade: the chart with your lines, the positions tab with its S/L and T/P
 * columns, the history. The numbers come back for you to check; nothing is saved
 * from here.
 *
 * The 5 API steps:
 *   1 endpoint (proxy + /v1/extract-plan)  2 method (POST)  3 headers (JSON)
 *   4 body ({ images: [{ mime, data }] })  5 response (status code, then { text })
 */

import * as DocumentPicker from 'expo-document-picker';

import type { PickedImage } from '@/lib/coach-vision';
import { getCachedAiReading, processShotImage, saveCachedAiReading } from '@/lib/shots';

export const MAX_IMAGES = 6;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

export type ExtractedPlan = {
  pair: string | null;
  direction: 'buy' | 'sell' | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  size: number | null;
  notes: string | null;
};

/** Opens the picker and allows choosing several images at once. */
export async function pickScreenshots(): Promise<PickedImage[]> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: 'image/*',
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.length) {
    return [];
  }
  return picked.assets.slice(0, MAX_IMAGES).map((asset) => ({
    uri: asset.uri,
    mime: asset.mimeType && asset.mimeType.startsWith('image/') ? asset.mimeType : 'image/jpeg',
    name: asset.name ?? 'screenshot',
  }));
}

/**
 * Stage 5: Smaller uploads everywhere images are sent.
 * Resizes to max 1280px, converts to WebP (~0.7 quality), and returns hash.
 */
export async function readAsBase64(
  image: PickedImage,
): Promise<{ mime: string; data: string; bytes: number; hash: string }> {
  try {
    const processed = await processShotImage(image.uri);
    return {
      mime: 'image/webp',
      data: processed.base64,
      bytes: processed.bytes,
      hash: processed.hash,
    };
  } catch (err) {
    console.warn('Fallback to raw image reading:', err);
    const blob = await (await fetch(image.uri)).blob();
    if (blob.size === 0) {
      throw new Error(`"${image.name}" was empty. Pick it again.`);
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Could not read "${image.name}".`));
      reader.readAsDataURL(blob);
    });
    return {
      mime: image.mime,
      data: dataUrl.slice(dataUrl.indexOf(',') + 1),
      bytes: blob.size,
      hash: '',
    };
  }
}

const num = (value: unknown): number | null =>
  value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
    ? null
    : Number(value);

export async function extractPlanFromImages(images: PickedImage[]): Promise<ExtractedPlan> {
  const base = (process.env.EXPO_PUBLIC_CLAUDE_PROXY_URL ?? '').trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error('Screenshots need the proxy. Set EXPO_PUBLIC_CLAUDE_PROXY_URL and restart the app.');
  }

  const encoded = [];
  let total = 0;
  const hashes: string[] = [];
  for (const image of images.slice(0, MAX_IMAGES)) {
    const item = await readAsBase64(image);
    total += item.bytes;
    if (item.hash) hashes.push(item.hash);
    encoded.push({ mime: item.mime, data: item.data });
  }
  if (total > MAX_TOTAL_BYTES) {
    throw new Error('Those screenshots are too large together (over 12 MB). Pick fewer or smaller ones.');
  }

  const primaryHash = hashes[0];
  if (primaryHash) {
    const cached = await getCachedAiReading(primaryHash);
    if (cached && typeof cached === 'object' && ('pair' in cached || 'direction' in cached)) {
      return cached as ExtractedPlan;
    }
  }

  // STEP 1-4: endpoint, method, headers, body
  const response = await fetch(base + '/v1/extract-plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ images: encoded }),
  });

  // STEP 5: 400 = unsupported image, 413 = too large, 404 = old proxy, 429 = free limit.
  const raw = await response.text();
  if (!response.ok) {
    let message: string | null = null;
    try {
      message = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? null;
    } catch {
      // not JSON
    }
    throw new Error(message ?? `Screenshot error ${response.status}`);
  }

  const { text } = JSON.parse(raw) as { text?: string };
  const body = text ?? '';
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end < start) {
    throw new Error('Could not read numbers from those screenshots. Try clearer ones.');
  }
  const parsed = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;

  const plan: ExtractedPlan = {
    pair: parsed.pair ? String(parsed.pair).toUpperCase() : null,
    direction: parsed.direction === 'buy' || parsed.direction === 'sell' ? parsed.direction : null,
    entry_price: num(parsed.entry_price),
    stop_loss: num(parsed.stop_loss),
    take_profit: num(parsed.take_profit),
    size: num(parsed.size),
    notes: parsed.notes ? String(parsed.notes) : null,
  };

  if (primaryHash) {
    saveCachedAiReading(primaryHash, plan as unknown as Record<string, unknown>).catch(() => {});
  }

  return plan;
}

/* ------------------------------------------------------------------ */
/* Many trades from history screenshots                                */
/* ------------------------------------------------------------------ */

export type HistoryTrade = {
  pair: string | null;
  direction: 'buy' | 'sell' | null;
  entry_price: number | null;
  exit_price: number | null;
  size: number | null;
  profit_loss: number | null;
  closed_at: string | null;
};

/** Reads every closed trade it can see across several history screenshots. */
export async function extractTradesFromImages(images: PickedImage[]): Promise<HistoryTrade[]> {
  const base = (process.env.EXPO_PUBLIC_CLAUDE_PROXY_URL ?? '').trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error('Screenshots need the proxy. Set EXPO_PUBLIC_CLAUDE_PROXY_URL and restart the app.');
  }

  const encoded = [];
  let total = 0;
  const hashes: string[] = [];
  for (const image of images.slice(0, MAX_IMAGES)) {
    const item = await readAsBase64(image);
    total += item.bytes;
    if (item.hash) hashes.push(item.hash);
    encoded.push({ mime: item.mime, data: item.data });
  }
  if (total > MAX_TOTAL_BYTES) {
    throw new Error('Those screenshots are too large together (over 12 MB). Pick fewer or smaller ones.');
  }

  const primaryHash = hashes[0];
  if (primaryHash) {
    const cached = await getCachedAiReading(primaryHash);
    if (cached && typeof cached === 'object' && Array.isArray((cached as Record<string, unknown>).trades)) {
      return (cached as Record<string, unknown>).trades as HistoryTrade[];
    }
  }

  // STEP 1-4: endpoint, method, headers, body
  const response = await fetch(base + '/v1/extract-trades', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ images: encoded }),
  });

  // STEP 5: 400 = unsupported image, 404 = old proxy, 429 = free limit, 502 = no internet on the proxy.
  const raw = await response.text();
  if (!response.ok) {
    let message: string | null = null;
    try {
      message = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? null;
    } catch {
      // not JSON
    }
    throw new Error(message ?? `Screenshot error ${response.status}`);
  }

  const { text } = JSON.parse(raw) as { text?: string };
  const body = text ?? '';
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end < start) {
    throw new Error('Could not read trades from those screenshots. Try clearer ones.');
  }
  const parsed = JSON.parse(body.slice(start, end + 1)) as { trades?: Record<string, unknown>[] };

  const trades: HistoryTrade[] = (parsed.trades ?? []).map((row) => ({
    pair: row.pair ? String(row.pair).toUpperCase() : null,
    direction: row.direction === 'buy' || row.direction === 'sell' ? row.direction : null,
    entry_price: num(row.entry_price),
    exit_price: num(row.exit_price),
    size: num(row.size),
    profit_loss: num(row.profit_loss),
    closed_at: row.closed_at ? String(row.closed_at) : null,
  }));

  if (primaryHash) {
    saveCachedAiReading(primaryHash, { trades } as unknown as Record<string, unknown>).catch(() => {});
  }

  return trades;
}
