/**
 * Where the AI proxy lives — one answer for every feature that needs it.
 *
 * Chat, plan grading, voice, and screenshot reading each used to work this out
 * on their own, and they disagreed. Chat fell back to the page's own origin,
 * which is right on Vercel (vercel.json rewrites /v1/* to api/gateway.mjs); the
 * other four threw "proxy not set". So on any deploy without
 * EXPO_PUBLIC_CLAUDE_PROXY_URL, Coach answered while "Grade vs Rules", the mic
 * and every screenshot button failed — the same backend, two verdicts.
 *
 * Order:
 *   1. EXPO_PUBLIC_CLAUDE_PROXY_URL when set. Any host, any platform.
 *   2. On web, the page's own origin. A static host with no /v1 function
 *      (GitHub Pages) answers 404 there, which `proxyErrorMessage` explains.
 *   3. Nothing. A native build has no origin to fall back on.
 *
 * `process.env.EXPO_PUBLIC_*` must stay a literal member expression — Expo
 * inlines it at bundle time by matching that exact shape.
 */

/** The origin the page was served from, or '' anywhere there is no page. */
export function webOrigin(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.location?.origin ?? '';
}

export function getEffectiveProxyUrl(
  configured: string | undefined = process.env.EXPO_PUBLIC_CLAUDE_PROXY_URL,
  origin: string = webOrigin(),
): string {
  const fromEnv = (configured ?? '').trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }
  return origin.replace(/\/+$/, '');
}

/** True when there is somewhere to send AI requests at all. */
export function hasProxy(): boolean {
  return getEffectiveProxyUrl() !== '';
}

/**
 * The proxy base, or a readable error naming the feature that needed it.
 * Every AI library calls this first, so the "not configured" message is the
 * same sentence everywhere instead of five slightly different ones.
 */
export function requireProxyUrl(feature: string): string {
  const base = getEffectiveProxyUrl();
  if (!base) {
    throw new Error(
      `${feature} needs the AI proxy. Set EXPO_PUBLIC_CLAUDE_PROXY_URL and restart the app.`,
    );
  }
  return base;
}

/**
 * Turns a failed proxy response into the sentence to show.
 *
 * Anthropic-shaped bodies carry `error.message`; that is used when present. A
 * 404 with no such body is almost always "there is no proxy at this address" —
 * the GitHub Pages case — and deserves to say so rather than "AI error 404".
 */
export function proxyErrorMessage(status: number, body: string, base: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // not JSON — fall through to the status-based message
  }
  if (status === 404) {
    return `No AI proxy answered at ${base}. Static hosting has no server, so point EXPO_PUBLIC_CLAUDE_PROXY_URL at one.`;
  }
  if (status === 429) {
    return 'The AI is rate-limited right now. Wait a minute and try again.';
  }
  if (status >= 500) {
    return `The AI proxy is up but failed upstream (HTTP ${status}). Try again shortly.`;
  }
  return `AI error ${status}`;
}
