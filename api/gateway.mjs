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

const PORT = Number(process.env.PORT ?? 8788);
const API_KEY = process.env.GEMINI_API_KEY;

// Model names change over time. If you get a 404 "model not found", check the
// current names in Google's docs and set GEMINI_MODEL to a valid one.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

// API STEP 1 - ENDPOINT: where the request goes.
const UPSTREAM = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Voice clips are sent inline (base64 inside the request). Google caps a whole
// request at 20 MB and base64 adds about a third, so refuse anything bigger than
// this. A few minutes of speech is far below it.
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

// Screenshots are sent the same way (inline base64), same 20 MB request cap.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

const EXTRACT_PROMPT =
  "This is a screenshot from MetaTrader (a trade history list, a closed trade, or an open position). " +
  "Read the single most recent or most prominent trade and return ONLY JSON with these keys: " +
  '"pair" (string such as BTCUSD, or null), "direction" ("buy" or "sell", or null), ' +
  '"entry_price" (number or null), "exit_price" (number or null), "size" (lots, number or null), ' +
  '"profit_loss" (number, negative for a loss, or null), ' +
  '"notes" (short string: anything unclear, and how many trades the screenshot shows). ' +
  "Use null for anything you cannot read clearly. Never guess or invent a number.";


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
  const contents = (appBody.messages ?? []).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // A screenshot attached in the Coach chat rides on the LAST user message.
  const shots = [...(appBody.image?.data ? [appBody.image] : []), ...(Array.isArray(appBody.images) ? appBody.images.slice(0, 6) : [])];
  if (shots.length > 0) {
    const last = contents[contents.length - 1];
    if (last && last.role === "user") {
      for (const shot of shots) {
        last.parts.push({ inline_data: { mime_type: shot.mime, data: shot.data } });
      }
    }
  }

  return {
    systemInstruction: { parts: [{ text: appBody.system ?? "" }] },
    contents,
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
  // Bigger limit than before, because a screenshot can ride along as base64.
  const appBody = JSON.parse((await readBody(req, 18 * 1024 * 1024)).toString("utf8"));

  for (const shot of [...(appBody.image ? [appBody.image] : []), ...(Array.isArray(appBody.images) ? appBody.images : [])]) {
    if (!IMAGE_MIMES.has(String(shot.mime))) {
      sendJson(res, 400, { error: { message: `Use a PNG, JPEG or WebP screenshot (got "${shot.mime}")` } });
      return;
    }
  }

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

/** POST /v1/extract-trade - screenshot. The request body IS the image file. */
async function handleExtractTrade(req, res) {
  let mime = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (!IMAGE_MIMES.has(mime)) {
    sendJson(res, 400, { error: { message: `Use a PNG, JPEG or WebP screenshot (got "${mime || "none"}")` } });
    return;
  }

  const image = await readBody(req, MAX_IMAGE_BYTES);
  if (image.length === 0) {
    sendJson(res, 400, { error: { message: "Empty image" } });
    return;
  }

  const result = await callGemini({
    contents: [
      {
        role: "user",
        parts: [
          { text: EXTRACT_PROMPT },
          { inline_data: { mime_type: mime, data: image.toString("base64") } },
        ],
      },
    ],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  });

  if (!result.ok) {
    sendJson(res, result.status, result.data);
    return;
  }

  const text = (result.data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  sendJson(res, 200, { text });
}

/** POST /v1/extract-plan - one or several screenshots of ONE trade, as JSON { images: [{ mime, data }] }. */
const PLAN_PROMPT = `These screenshots show ONE forex/CFD trade (chart with lines, positions tab, order ticket or history). Combine them and read: pair (symbol, e.g. XAUUSD), direction ("buy" or "sell"), entry_price, stop_loss (S/L), take_profit (T/P), size (lots), notes (one short line of anything useful). Use null for anything not clearly visible. Never invent or estimate numbers. Reply with JSON only: {"pair":..,"direction":..,"entry_price":..,"stop_loss":..,"take_profit":..,"size":..,"notes":..}`;

async function handleExtractPlan(req, res) {
  const body = JSON.parse((await readBody(req, 18 * 1024 * 1024)).toString("utf8"));
  const images = Array.isArray(body.images) ? body.images.slice(0, 6) : [];
  if (images.length === 0) {
    sendJson(res, 400, { error: { message: "No images sent" } });
    return;
  }
  const parts = [{ text: PLAN_PROMPT }];
  for (const img of images) {
    let mime = String(img.mime ?? "").toLowerCase();
    if (mime === "image/jpg") mime = "image/jpeg";
    if (!IMAGE_MIMES.has(mime) || !img.data) {
      sendJson(res, 400, { error: { message: `Use PNG, JPEG or WebP screenshots (got "${mime || "none"}")` } });
      return;
    }
    parts.push({ inline_data: { mime_type: mime, data: img.data } });
  }
  const result = await callGemini({
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  });
  if (!result.ok) {
    sendJson(res, result.status, result.data);
    return;
  }
  const text = (result.data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  sendJson(res, 200, { text });
}

/** Shared: turns [{mime,data}] into Gemini parts. Returns null (after replying) if one is not an allowed image. */
function imageParts(res, images) {
  const parts = [];
  for (const img of images) {
    let mime = String(img.mime ?? "").toLowerCase();
    if (mime === "image/jpg") mime = "image/jpeg";
    if (!IMAGE_MIMES.has(mime) || !img.data) {
      sendJson(res, 400, { error: { message: `Use PNG, JPEG or WebP screenshots (got "${mime || "none"}")` } });
      return null;
    }
    parts.push({ inline_data: { mime_type: mime, data: img.data } });
  }
  return parts;
}

async function jsonFromGemini(res, parts) {
  const result = await callGemini({
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  });
  if (!result.ok) {
    sendJson(res, result.status, result.data);
    return;
  }
  const text = (result.data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  sendJson(res, 200, { text });
}

/** POST /v1/extract-trades - several screenshots of trade HISTORY, many trades. JSON { images }. */
const TRADES_PROMPT = `These screenshots show a trader's CLOSED trades (MetaTrader history tab or similar). Read EVERY closed trade row you can see across all screenshots. If the same trade appears twice, list it once. Reply with JSON only: {"trades":[{"pair":string|null,"direction":"buy"|"sell"|null,"entry_price":number|null,"exit_price":number|null,"size":number|null,"profit_loss":number|null,"closed_at":string|null}]}. profit_loss is negative for a loss. Use null for anything not clearly readable. Never invent or estimate a number. Do not include open positions.`;

async function handleExtractTrades(req, res) {
  const body = JSON.parse((await readBody(req, 18 * 1024 * 1024)).toString("utf8"));
  const images = Array.isArray(body.images) ? body.images.slice(0, 6) : [];
  if (images.length === 0) {
    sendJson(res, 400, { error: { message: "No images sent" } });
    return;
  }
  const parts = imageParts(res, images);
  if (!parts) return;
  await jsonFromGemini(res, [{ text: TRADES_PROMPT }, ...parts]);
}

/** POST /v1/extract-entry - what the user said (and any screenshots) -> something to save. JSON { text, images? }. */
function entryPrompt(text) {
  return `You turn a trader's spoken or typed message into a journal record. Today is ${new Date().toISOString().slice(0, 10)}.
Decide "kind":
- "trade": a trade that is already CLOSED (has an exit price or a result) and should be logged.
- "plan": a trade they are about to take or are in right now (entry, stop, target, reasons).
- "note": only feelings or what happened BEFORE a trade ("phase":"before") or AFTER a trade ("phase":"after"), with no new trade.
- "none": it is a question or chat, not something to save.
Reply with JSON only: {"kind":..,"pair":string|null,"direction":"buy"|"sell"|null,"entry_price":number|null,"exit_price":number|null,"stop_loss":number|null,"take_profit":number|null,"size":number|null,"profit_loss":number|null,"reasons":string,"feelings":string,"phase":"before"|"after"|null,"summary":string}.
Use null for anything not clearly said or visible. Never invent or estimate a number. Numbers from screenshots must be ones you can read. "reasons" is why they took or plan the trade; "feelings" is how they felt; copy their words, do not add advice. "summary" is one short plain sentence of what you understood.
The user's message:
"""${text}"""`;
}

async function handleExtractEntry(req, res) {
  const body = JSON.parse((await readBody(req, 18 * 1024 * 1024)).toString("utf8"));
  const images = Array.isArray(body.images) ? body.images.slice(0, 6) : [];
  const parts = imageParts(res, images);
  if (!parts) return;
  await jsonFromGemini(res, [{ text: entryPrompt(String(body.text ?? "").slice(0, 6000)) }, ...parts]);
}

export const config = { api: { bodyParser: false }, maxDuration: 60 };

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
  const route = new URL(req.url, "http://x").searchParams.get("route") ?? "";
  if (!API_KEY) { sendJson(res, 500, { error: { message: "GEMINI_API_KEY is not set on Vercel." } }); return; }
  try {
    if (req.method !== "POST") { sendJson(res, 404, { error: { message: "Not found" } }); return; }
    if (route === "messages") await handleChat(req, res);
    else if (route === "transcribe") await handleTranscribe(req, res);
    else if (route === "extract-trades") await handleExtractTrades(req, res);
    else if (route === "extract-trade") await handleExtractTrade(req, res);
    else if (route === "extract-plan") await handleExtractPlan(req, res);
    else if (route === "extract-entry") await handleExtractEntry(req, res);
    else sendJson(res, 404, { error: { message: "Not found" } });
  } catch (error) {
    console.error(error);
    if (error.status === 413) { sendJson(res, 413, { error: { message: "That upload is too large. Try a shorter recording or fewer screenshots." } }); return; }
    sendJson(res, 502, { error: { message: "Proxy could not reach Gemini: " + error.message } });
  }
}
