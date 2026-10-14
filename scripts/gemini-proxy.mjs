/**
 * Gemini proxy for the Chat tab (free-tier friendly, zero dependencies).
 *
 * Your app (src/lib/claude-client.ts) still sends the same body it always did.
 * This server TRANSLATES that body into Gemini's format, calls Gemini with
 * your key, then translates the answer back into the shape the app already
 * understands. That means the app code does not change at all.
 *
 *   Git Bash:
 *   GEMINI_API_KEY=your_key_here node scripts/gemini-proxy.mjs
 *   # then keep EXPO_PUBLIC_CLAUDE_PROXY_URL=http://localhost:8788
 *
 * Like the old proxy, this trusts any caller that can reach the port.
 * Fine on localhost. Put real authentication in front of it before hosting it.
 */

import { Buffer } from "node:buffer";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8788);
const API_KEY = process.env.GEMINI_API_KEY;

// Model names change over time. If you get a 404 "model not found", check the
// current names in Google's docs and set GEMINI_MODEL to a valid one.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// API STEP 1 - ENDPOINT: where the request goes.
const UPSTREAM = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

if (!API_KEY) {
  console.error("GEMINI_API_KEY is not set.");
  console.error("Usage: GEMINI_API_KEY=your_key node scripts/gemini-proxy.mjs");
  process.exit(1);
}

/** The app runs on a different origin, so the browser sends a preflight. */
function cors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
}

/**
 * Anthropic-style body in  ->  Gemini-style body out.
 *   app:    { system, messages: [{ role: "user" | "assistant", content }], max_tokens }
 *   gemini: { systemInstruction, contents: [{ role: "user" | "model", parts }], generationConfig }
 * The only real differences: "assistant" is called "model", and text lives in parts.
 */
function toGeminiBody(appBody) {
  return {
    systemInstruction: { parts: [{ text: appBody.system ?? "" }] },
    contents: (appBody.messages ?? []).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: { maxOutputTokens: appBody.max_tokens ?? 1000 },
  };
}

/**
 * Gemini response in  ->  the shape readReply() in claude-client.ts expects:
 *   { content: [{ type: "text", text }], stop_reason }
 */
function toAppResponse(geminiData) {
  const candidate = geminiData.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");

  // Map Gemini's finishReason onto the stop_reason values the app handles.
  let stopReason = "end_turn";
  const finish = candidate?.finishReason;
  if (finish === "MAX_TOKENS") stopReason = "max_tokens";
  // A blocked prompt has no candidates at all; blocked output has a safety reason.
  if (geminiData.promptFeedback?.blockReason || ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(finish)) {
    stopReason = "refusal";
  }

  return { content: [{ type: "text", text }], stop_reason: stopReason };
}

const server = createServer(async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  // The app still posts to /v1/messages, so we keep that path.
  if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Not found" } }));
    return;
  }

  try {
    // Read the request body the app sent us.
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const appBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    const upstream = await fetch(UPSTREAM, {
      // API STEP 2 - METHOD: POST, because we are sending data.
      method: "POST",
      // API STEP 3 - HEADERS: data format + your secret key.
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": API_KEY,
      },
      // API STEP 4 - BODY: the translated conversation.
      body: JSON.stringify(toGeminiBody(appBody)),
    });

    // API STEP 5 - RESPONSE: read the status code first, then the data.
    const data = await upstream.json();
    console.log(`${upstream.status} ${upstream.statusText}`);

    if (!upstream.ok) {
      // 400 = bad body or bad key, 404 = wrong model name, 429 = free-tier limit hit.
      // Gemini errors use { error: { message } }, same as the app expects.
      res.writeHead(upstream.status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(toAppResponse(data)));
  } catch (error) {
    console.error(error);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: `Proxy could not reach Gemini: ${error.message}` } }));
  }
});

server.listen(PORT, () => {
  console.log(`Gemini proxy on http://localhost:${PORT} (model: ${MODEL})`);
  console.log(`Keep EXPO_PUBLIC_CLAUDE_PROXY_URL=http://localhost:${PORT}`);
});
