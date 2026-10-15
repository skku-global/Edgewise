/**
 * Lets the Coach chat look at a screenshot you attach with the "+" button.
 *
 * Same proxy, same /v1/messages route as normal chat. The only difference is an
 * extra `image` field in the body (base64 text), which the proxy attaches to your
 * last message before sending it to Gemini.
 *
 * The 5 API steps:
 *   1 endpoint (proxy + /v1/messages)  2 method (POST)  3 headers (content-type)
 *   4 body (system, messages, image)   5 response (status code, then the text)
 */

import * as DocumentPicker from 'expo-document-picker';

import type { ClaudeTurn } from '@/lib/claude-client';

export type PickedImage = { uri: string; mime: string; name: string };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Opens the gallery/files picker. Returns null if you cancel. */
export async function pickScreenshot(): Promise<PickedImage | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: 'image/*',
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.[0]) {
    return null;
  }
  const asset = picked.assets[0];
  return {
    uri: asset.uri,
    mime: asset.mimeType && asset.mimeType.startsWith('image/') ? asset.mimeType : 'image/jpeg',
    name: asset.name ?? 'screenshot',
  };
}

async function toBase64(image: PickedImage): Promise<string> {
  const blob = await (await fetch(image.uri)).blob();
  if (blob.size === 0) {
    throw new Error('That image was empty. Pick it again.');
  }
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error('That image is too large (over 8 MB). Use a smaller screenshot.');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

function buildSystemPrompt(): string {
  return `You are the trading coach inside the user's own trading journal app. You have a briefing of their actual trades in the first user message, followed by questions about it. The user has also attached a screenshot (usually a MetaTrader chart, trade, or history).

Talk like a coach: direct, plain-spoken, no fluff. Short answers, a paragraph or a few bullets. Say "I" and "you".

Describe only what is actually visible in the screenshot: entry and exit marks, stop and target lines, prices you can read clearly. If a number is hard to read, say so instead of guessing. Link what you see to their logged trades and moods when it genuinely connects, and say clearly when you are only speculating.

Never tell them to enter, hold, close, or move a stop. Help them see their own decisions and patterns. You are not a financial advisor.

Today's date is ${new Date().toISOString().slice(0, 10)}.`;
}

/** Same as askClaude, plus a screenshot on the latest question. */
export async function askWithImage(
  briefing: string,
  history: ClaudeTurn[],
  image: PickedImage,
): Promise<string> {
  const base = (process.env.EXPO_PUBLIC_CLAUDE_PROXY_URL ?? '').trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error('Screenshots need the proxy. Set EXPO_PUBLIC_CLAUDE_PROXY_URL and restart the app.');
  }

  const messages: ClaudeTurn[] = [
    ...(briefing ? [{ role: 'user' as const, content: `=== YOUR DATA ===\n${briefing}` }] : []),
    ...history,
  ];

  const data = await toBase64(image);

  // STEP 1-4: endpoint, method, headers, body
  const response = await fetch(base + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system: buildSystemPrompt(),
      messages,
      max_tokens: 4000,
      image: { mime: image.mime, data },
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
