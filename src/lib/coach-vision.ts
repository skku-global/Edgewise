/**
 * Lets the Coach chat look at screenshots you attach with the "+" button.
 * One screenshot or several, sent together with your next message.
 *
 * Same proxy, same /v1/messages route as normal chat. The only difference is an
 * extra `images` field in the body (base64 text), which the proxy attaches to your
 * last message before sending it to Gemini.
 *
 * The 5 API steps:
 *   1 endpoint (proxy + /v1/messages)  2 method (POST)  3 headers (content-type)
 *   4 body (system, messages, images)  5 response (status code, then the text)
 */

import * as DocumentPicker from 'expo-document-picker';

import type { ClaudeTurn } from '@/lib/claude-client';

export type PickedImage = { uri: string; mime: string; name: string };

const MAX_IMAGES = 6;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

/** Opens the gallery/files picker. Several images can be chosen at once. */
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

/** Kept for older callers: one screenshot or nothing. */
export async function pickScreenshot(): Promise<PickedImage | null> {
  return (await pickScreenshots())[0] ?? null;
}

async function toBase64(image: PickedImage): Promise<{ data: string; bytes: number }> {
  const blob = await (await fetch(image.uri)).blob();
  if (blob.size === 0) {
    throw new Error(`"${image.name}" was empty. Pick it again.`);
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
  return { data: dataUrl.slice(dataUrl.indexOf(',') + 1), bytes: blob.size };
}

function buildSystemPrompt(): string {
  return `You are the trading coach inside the user's own trading journal app. You have a briefing of their actual trades in the first user message, followed by questions about it. The user has also attached one or more screenshots (usually MetaTrader charts, trades, or history).

Talk like a coach: direct, plain-spoken, no fluff. Short answers, a paragraph or a few bullets. Say "I" and "you".

Describe only what is actually visible in the screenshots: entry and exit marks, stop and target lines, prices you can read clearly. If a number is hard to read, say so instead of guessing. Link what you see to their logged trades and moods when it genuinely connects, and say clearly when you are only speculating.

Never tell them to enter, hold, close, or move a stop. Help them see their own decisions and patterns. You are not a financial advisor.

Today's date is ${new Date().toISOString().slice(0, 10)}.`;
}

/** Same as askClaude, plus screenshots on the latest question. */
export async function askWithImage(
  briefing: string,
  history: ClaudeTurn[],
  image: PickedImage | PickedImage[],
): Promise<string> {
  const base = (process.env.EXPO_PUBLIC_CLAUDE_PROXY_URL ?? '').trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error('Screenshots need the proxy. Set EXPO_PUBLIC_CLAUDE_PROXY_URL and restart the app.');
  }

  const list = (Array.isArray(image) ? image : [image]).slice(0, MAX_IMAGES);
  const messages: ClaudeTurn[] = [
    ...(briefing ? [{ role: 'user' as const, content: `=== YOUR DATA ===\n${briefing}` }] : []),
    ...history,
  ];

  const images = [];
  let total = 0;
  for (const item of list) {
    const encoded = await toBase64(item);
    total += encoded.bytes;
    images.push({ mime: item.mime, data: encoded.data });
  }
  if (total > MAX_TOTAL_BYTES) {
    throw new Error('Those screenshots are too large together (over 12 MB). Attach fewer or smaller ones.');
  }

  // STEP 1-4: endpoint, method, headers, body
  const response = await fetch(base + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system: buildSystemPrompt(),
      messages,
      max_tokens: 4000,
      images,
    }),
  });

  // STEP 5: 400 = unsupported image type, 413 = too large, 404 = old proxy, 429 = free limit.
  const raw = await response.text();
  if (!response.ok) {
    let message: string | null = null;
    try {
      message = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? null;
    } catch {
      // not JSON
    }
    throw new Error(message ?? `Coach error ${response.status}`);
  }

  const parsed = JSON.parse(raw) as {
    content?: { type: string; text?: string }[];
    stop_reason?: string | null;
  };
  if (parsed.stop_reason === 'refusal') {
    return 'The coach declined to answer that one. Try asking it a different way.';
  }
  const text = (parsed.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
    .trim();
  if (parsed.stop_reason === 'max_tokens') {
    return text
      ? `${text}\n\n(Cut off — that answer hit the length limit.)`
      : 'That used up the whole length limit before an answer. Try asking something narrower.';
  }
  return text;
}
