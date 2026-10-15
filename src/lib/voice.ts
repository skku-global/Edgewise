/**
 * Voice -> text, through your own proxy.
 *
 * The phone records a short audio file. This file sends that audio to the
 * proxy (scripts/gemini-proxy.mjs), which asks Gemini to write down what was
 * said and sends the words back. The key never leaves the proxy.
 *
 * No internet? `OfflineError` is thrown instead of a vague failure, and
 * `lib/voice-queue.ts` keeps the recording so it can be written out later.
 *
 * The 5 API steps, in this file:
 *   1. ENDPOINT  proxy URL + "/v1/transcribe"
 *   2. METHOD    POST (we are sending data)
 *   3. HEADERS   content-type = the audio format, so the proxy knows what it got
 *   4. BODY      the raw audio bytes (a Blob)
 *   5. RESPONSE  check response.ok (the status code), then read { text }
 */

import { Platform } from 'react-native';

/** The recording could not be sent because there is no internet right now. */
export class OfflineError extends Error {
  constructor() {
    super('No internet right now.');
    this.name = 'OfflineError';
  }
}

/** Audio type to send: phones record .m4a, browsers tell us the type themselves. */
export function audioMime(blob: Blob): string {
  return Platform.OS === 'web' ? blob.type || 'audio/webm' : 'audio/m4a';
}

/** Sends the audio bytes and returns the words. Throws OfflineError or a readable message. */
export async function transcribeBlob(blob: Blob, mime: string): Promise<string> {
  const proxy = (process.env.EXPO_PUBLIC_CLAUDE_PROXY_URL ?? '').trim();
  if (!proxy) {
    // Voice needs the proxy because the proxy is what holds the Gemini key.
    throw new Error('Voice needs the proxy. Set EXPO_PUBLIC_CLAUDE_PROXY_URL and restart the app.');
  }
  if (blob.size === 0) {
    throw new Error('The recording was empty. Hold the mic a little longer.');
  }
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new OfflineError();
  }

  // STEP 1 (endpoint) + STEP 2 (method) + STEP 3 (headers) + STEP 4 (body)
  let response: Response;
  try {
    response = await fetch(proxy.replace(/\/+$/, '') + '/v1/transcribe', {
      method: 'POST',
      headers: { 'content-type': mime },
      body: blob,
    });
  } catch {
    // fetch itself failed: the proxy or the network could not be reached.
    throw new OfflineError();
  }

  // STEP 5: the status code comes first.
  //   400 = bad audio or bad key, 404 = wrong model name or wrong URL,
  //   413 = recording too long, 429 = free limit reached,
  //   502 = the proxy is running but cannot reach Gemini (no internet on that computer).
  if (!response.ok) {
    if (response.status === 502) {
      throw new OfflineError();
    }
    const raw = await response.text();
    let message: string | null = null;
    try {
      message = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? null;
    } catch {
      // not JSON, fall through to the generic message
    }
    throw new Error(message ?? `Voice error ${response.status}`);
  }

  const data = (await response.json()) as { text?: string };
  const text = (data.text ?? '').trim();
  if (!text) {
    throw new Error("Couldn't hear anything in that recording. Try again a bit closer to the mic.");
  }
  return text;
}

/** Turns the file recorded at `uri` into text. */
export async function transcribeRecording(uri: string): Promise<string> {
  // Read the recorded file from the phone into a Blob (raw bytes).
  const blob = await (await fetch(uri)).blob();
  return transcribeBlob(blob, audioMime(blob));
}
