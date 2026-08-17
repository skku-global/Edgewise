/**
 * Minimal Claude Messages API client for the Chat tab.
 *
 * Two transport modes, chosen at build time by EXPO_PUBLIC_CLAUDE_PROXY_URL:
 *   - Proxy (recommended, no key shipped to clients): every request goes to
 *     that URL as POST /v1/messages, and the server forwards to
 *     api.anthropic.com with the real key. `scripts/claude-proxy.mjs` is a
 *     zero-dependency Node server that does exactly this; `.env.example`
 *     explains how to start it. It sends no auth of its own, so the proxy
 *     trusts any caller that can reach it — fine on localhost, not beyond.
 *   - Direct (local prototyping only): the browser talks to api.anthropic.com
 *     with the publishable key inline. The key is then readable by anyone who
 *     opens the app, so it must not be a live billed key. The API explicitly
 *     supports this pattern via the anthropic-dangerous-direct-browser-access
 *     header (verified against the live CORS preflight).
 *
 * The screen only calls `askClaude` when a key is present; `hasClaudeKey`
 * decides what to render, so the UI never shows a dead send button.
 */

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Overridable so the model can be changed without touching code. */
const MODEL = (process.env.EXPO_PUBLIC_CLAUDE_MODEL ?? "").trim() || "claude-sonnet-5";

/**
 * Deliberately far larger than the paragraph-length answers the system prompt
 * asks for, because max_tokens is one budget covering thinking *and* reply
 * text, and the current models think by default. At 700 a question like "why do
 * I keep losing on breakouts" spends the entire budget reasoning over a
 * 200-trade briefing and returns stop_reason "max_tokens" with nothing in the
 * text block — which the chat screen renders as "Claude returned an empty
 * reply", pointing at the wrong culprit entirely. Headroom is free: billing
 * follows tokens actually produced, not the cap.
 */
const MAX_TOKENS = 4000;

export type ClaudeRole = "user" | "assistant";

export type ClaudeTurn = {
  role: ClaudeRole;
  content: string;
};

/**
 * Built per request rather than at import: a session left open overnight would
 * otherwise keep telling Claude it is still yesterday.
 */
function buildSystemPrompt(): string {
  return `You are the trading coach inside the user's own trading journal app. You have a briefing of their actual trades in the first user message, followed by questions about it.

Talk like a coach, not a therapist: direct, a little plain-spoken, no fluff. Short answers - a paragraph or a few bullets, not essays. Say "I" and "you", not "we".

Only ever discuss the trades and moods in the briefing. If the user asks about markets, setups, or strategy in general, answer from what the briefing shows and say clearly when you are only speculating.

Quote real numbers and trades from the briefing. P/L figures flagged "(calculated)" were derived from price moves and exclude spread and commission - say so when the user asks about exact money. Treat near-duplicate setup labels ("breakout" vs "breakoutr") as one setup.

Be honest about the data: if the sample is too small or the pattern is noise, say so. Never present a guess as a fact.

If there is no briefing (the user has logged no trades yet), say so and point them at the Trades tab instead of making things up.

Today's date is ${new Date().toISOString().slice(0, 10)}.`;
}

/**
 * True when a usable key exists: the direct key, or a proxy configured (the
 * proxy owns its key, so this client never needs one).
 */
export function hasClaudeKey(): boolean {
  return (
    (process.env.EXPO_PUBLIC_CLAUDE_PROXY_URL ?? "").trim() !== "" ||
    (process.env.EXPO_PUBLIC_CLAUDE_API_KEY ?? "").trim() !== ""
  );
}

/**
 * Calls Claude with the trade briefing and the full conversation so answers
 * can reference earlier trades. Throws on network or API errors; the caller
 * turns the message into UI state.
 */
export async function askClaude(
  briefing: string,
  history: ClaudeTurn[],
): Promise<string> {
  const directKey = process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
  const proxyUrl = process.env.EXPO_PUBLIC_CLAUDE_PROXY_URL;
  const proxy = (proxyUrl ?? "").trim();
  const key = (directKey ?? "").trim();

  const messages: ClaudeTurn[] = [
    ...(briefing
      ? [{ role: "user" as const, content: `=== YOUR DATA ===\n${briefing}` }]
      : []),
    ...history,
  ];

  // One body for both transports: the proxy forwards it byte for byte, so the
  // two paths must not be able to drift apart.
  //
  // No `thinking` field on purpose. Current models run adaptive thinking when
  // it is omitted, which is what reasoning over a whole trade history wants,
  // and omitting it is also the only setting that survives someone pointing
  // EXPO_PUBLIC_CLAUDE_MODEL at an older model: those need the retired
  // budget_tokens form, and the current ones reject it with a 400.
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages,
    system: buildSystemPrompt(),
  });

  if (proxy) {
    const response = await fetch(proxy.replace(/\/+$/, "") + "/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        extractErrorMessage(errorBody) ?? `Claude proxy error ${response.status}`,
      );
    }
    return readReply((await response.json()) as MessagesResponse);
  }

  if (!key) {
    throw new Error("No Claude key configured");
  }

  const response = await fetch(MESSAGES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const message =
      extractErrorMessage(errorBody) ?? `Claude API error ${response.status}`;
    throw new Error(message);
  }

  return readReply((await response.json()) as MessagesResponse);
}

type MessagesResponse = {
  content?: { type: string; text?: string }[];
  stop_reason?: string | null;
};

/**
 * Turns a successful response into the text to show in a bubble.
 *
 * stop_reason is checked before the content blocks because two of its values
 * mean those blocks are not an answer, and both would otherwise arrive as a
 * blank bubble with no explanation: "refusal" is the model declining, which
 * leaves no text at all, and "max_tokens" means the budget ran out mid-sentence
 * so whatever text exists is a fragment. Thinking blocks fall out via the type
 * filter — the chat has nowhere to put them.
 */
function readReply(data: MessagesResponse): string {
  if (data.stop_reason === "refusal") {
    return "Claude declined to answer that one. Try asking it a different way.";
  }

  const text = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");

  if (data.stop_reason === "max_tokens") {
    return text.trim()
      ? `${text.trimEnd()}\n\n(Cut off — that answer hit the length limit.)`
      : "That question used up the whole length limit before Claude got to an answer. Try asking something narrower.";
  }

  return text;
}

/** Pulls Anthropic's human-readable message out of an error body, if any. */
function extractErrorMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message ?? null;
  } catch {
    return null;
  }
}
