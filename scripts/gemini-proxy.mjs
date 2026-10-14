/**
 * Gemini proxy for the Chat tab (free-tier friendly, zero dependencies).
 *
 * Two routes:
 *   POST /v1/messages    chat. The app sends the same body it always did; this
 *                        translates it to Gemini's format and translates the
 *                        answer back, so the app code does not change.
 *   POST /v1/transcribe  voice. The app sends raw audio bytes; this asks Gemini
 *                        to write down what was said and returns { text }.
 *
 *   Git Bash:
 *   GEMINI_API_KEY=your_key_here node scripts/gemini-proxy.mjs
 *   # then keep EXPO_PUBLIC_CLAUDE_PROXY_URL=http://localhost:8788
 *
 * Like the old proxy, this trusts any caller that can reach the port.
 * Fine on localhost. Put real authentication in front of it before hosting it,
 * or anyone who finds the URL can use up your free limit.
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

// Voice clips are sent inline (base64 inside the request). Google caps a whole
// request at 20 MB and base64 adds about a third, so refuse anything bigger than
// this. A few minutes of speech is far below it.
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

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

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

/** Reads the whole request body. Stops early if it grows past `limit` bytes. */
async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Request body too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * The one place that talks to Gemini, so chat and voice share steps 2 to 5.
 * Returns { status, ok, data }.
 */
async function callGemini(geminiBody) {
  const upstream = await fetch(UPSTREAM, {
    // API STEP 2 - METHOD: POST, because we are sending data.
    method: "POST",
    // API STEP 3 - HEADERS: data format + your secret key.
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": API_KEY,
    },
    // API STEP 4 - BODY: the conversation (chat) or the audio + instruction (voice).
    body: JSON.stringify(geminiBody),
  });

  // API STEP 5 - RESPONSE: read the status code first, then the data.
  const data = await upstream.json();
  console.log(`${upstream.status} ${upstream.statusText}`);
  return { status: upstream.status, ok: upstream.ok, data };
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

/** POST /v1/messages - chat. */
async function handleChat(req, res) {
  const appBody = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8"));
  const result = await callGemini(toGeminiBody(appBody));

  if (!result.ok) {
    // 400 = bad body or bad key, 404 = wrong model name, 429 = free-tier limit hit.
    sendJson(res, result.status, result.data);
    return;
  }
  sendJson(res, 200, toAppResponse(result.data));
}

/** POST /v1/transcribe - voice. The request body IS the audio file. */
async function handleTranscribe(req, res) {
  // The app puts the audio format in the content-type header (audio/m4a, audio/webm...).
  let mime = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (mime === "audio/mp4") mime = "audio/m4a"; // same container, the name Gemini lists
  if (!mime.startsWith("audio/")) {
    sendJson(res, 400, { error: { message: `Expected an audio content-type, got "${mime || "none"}"` } });
    return;
  }

  const audio = await readBody(req, MAX_AUDIO_BYTES);
  if (audio.length === 0) {
    sendJson(res, 400, { error: { message: "Empty audio" } });
    return;
  }

  const result = await callGemini({
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "Write down exactly what is said in this audio, in the language it is spoken " +
              "(English, Nigerian Pidgin, or a mix). Do not summarise, translate, or add any " +
              "commentary. Output only the spoken words. If there is no speech, output nothing.",
          },
          // The audio travels as base64 text inside the JSON body.
          { inline_data: { mime_type: mime, data: audio.toString("base64") } },
        ],
      },
    ],
    generationConfig: { temperature: 0 },
  });

  if (!result.ok) {
    sendJson(res, result.status, result.data);
    return;
  }

  const text = (result.data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  sendJson(res, 200, { text });
}

const server = createServer(async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  try {
    if (req.method === "POST" && req.url?.startsWith("/v1/messages")) {
      await handleChat(req, res);
    } else if (req.method === "POST" && req.url?.startsWith("/v1/transcribe")) {
      await handleTranscribe(req, res);
    } else {
      sendJson(res, 404, { error: { message: "Not found" } });
    }
  } catch (error) {
    console.error(error);
    if (error.status === 413) {
      sendJson(res, 413, { error: { message: "That recording is too long. Try a shorter one." } });
      return;
    }
    sendJson(res, 502, { error: { message: `Proxy could not reach Gemini: ${error.message}` } });
  }
});

server.listen(PORT, () => {
  console.log(`Gemini proxy on http://localhost:${PORT} (model: ${MODEL})`);
  console.log(`Routes: POST /v1/messages (chat), POST /v1/transcribe (voice)`);
  console.log(`Keep EXPO_PUBLIC_CLAUDE_PROXY_URL=http://localhost:${PORT}`);
});
