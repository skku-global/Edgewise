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

const CHART_GUIDE = `HOW TO READ A TRADE CHART (MetaTrader 4/5 and TradingView):
- Prices: read each number from the price scale on the RIGHT edge of the chart, or from the label attached to the line (for example "sl 4012.50", "tp 4045.00", "#123 buy 0.10"). Never estimate a price from where a line sits on screen.
- MetaTrader 4/5 defaults: the entry/open price is a dotted line with a small arrow or "#ticket buy/sell lots" label (often grey or blue-ish; buy arrow blue, sell arrow red). Stop loss (S/L) is a RED dashed line with an "sl" label. Take profit (T/P) is a GREEN dashed line with a "tp" label. The Trade tab lists Symbol, Type (buy/sell), Volume (lots), Price (entry), S / L, T / P, then profit.
- TradingView Long Position / Short Position tool: a box split in two coloured zones from the entry line. The TARGET (take profit) zone is the GREEN/TEAL zone (or blue on some themes); the STOP zone is the RED/PINK zone. The entry price is the line where the two zones meet. Long = target above entry, stop below. Short = target below entry, stop above. Labels inside the zones show price, points and risk/reward.
- Users can change colours. If a line colour does not match, decide from the label text first, then from position: for a buy, stop is below entry and target above; for a sell the reverse.
- Direction: buy/long if the target is above the entry, sell/short if below.
- If two lines cannot be told apart, or a number is cut off or blurry, return null for it and say so. Never invent, round or guess a number.
`;

const EXTRACT_PROMPT =
  CHART_GUIDE + "This is a screenshot from MetaTrader (a trade history list, a closed trade, or an open position). " +
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

// ---- Backup AI provider (any OpenAI-compatible free API; Groq by default) ----
// Used automatically when Gemini is rate-limited, down, or has no key.
//   GROQ_API_KEY=...  (free at console.groq.com)  or  FALLBACK_API_KEY + FALLBACK_BASE_URL
const FB_KEY = process.env.FALLBACK_API_KEY ?? process.env.GROQ_API_KEY;
const FB_BASE = (process.env.FALLBACK_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/+$/, "");
const FB_TEXT = process.env.FALLBACK_TEXT_MODEL ?? "llama-3.3-70b-versatile";
const FB_VISION = process.env.FALLBACK_VISION_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct";
const FB_STT = process.env.FALLBACK_STT_MODEL ?? "whisper-large-v3-turbo";

function fbReply(text) {
  return { status: 200, ok: true, data: { candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] } };
}

async function callFallback(g) {
  const parts = (g.contents ?? []).flatMap((c) => c.parts ?? []);
  const audio = parts.find((p) => p.inline_data?.mime_type?.startsWith("audio/"));
  if (audio) {
    const mime = audio.inline_data.mime_type;
    const form = new FormData();
    form.append("file", new Blob([Buffer.from(audio.inline_data.data, "base64")], { type: mime }), "audio." + (mime.split("/")[1] || "webm").replace("x-", ""));
    form.append("model", FB_STT);
    form.append("response_format", "json");
    form.append("temperature", "0");
    const r = await fetch(FB_BASE + "/audio/transcriptions", { method: "POST", headers: { authorization: "Bearer " + FB_KEY }, body: form });
    const d = await r.json();
    console.log("fallback stt " + r.status);
    return r.ok ? fbReply(d.text ?? "") : { status: r.status, ok: false, data: d };
  }
  const hasImage = parts.some((p) => p.inline_data);
  const messages = [];
  const sys = (g.systemInstruction?.parts ?? []).map((p) => p.text ?? "").join("");
  if (sys) messages.push({ role: "system", content: sys });
  for (const c of g.contents ?? []) {
    const content = [];
    for (const p of c.parts ?? []) {
      if (p.text) content.push({ type: "text", text: p.text });
      else if (p.inline_data) content.push({ type: "image_url", image_url: { url: "data:" + p.inline_data.mime_type + ";base64," + p.inline_data.data } });
    }
    messages.push({ role: c.role === "model" ? "assistant" : "user", content: hasImage ? content : content.map((x) => x.text).join("\n") });
  }
  const wantsJson = g.generationConfig?.responseMimeType === "application/json";
  const body = { model: hasImage ? FB_VISION : FB_TEXT, messages, max_tokens: g.generationConfig?.maxOutputTokens ?? 2000, temperature: g.generationConfig?.temperature ?? 0.3 };
  if (wantsJson && !hasImage) body.response_format = { type: "json_object" };
  const r = await fetch(FB_BASE + "/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + FB_KEY }, body: JSON.stringify(body) });
  const d = await r.json();
  console.log("fallback chat " + r.status);
  if (!r.ok) return { status: r.status, ok: false, data: d };
  let text = d.choices?.[0]?.message?.content ?? "";
  if (wantsJson) {
    const a = text.indexOf("{");
    const z = text.lastIndexOf("}");
    if (a >= 0 && z > a) text = text.slice(a, z + 1);
  }
  const res = fbReply(text);
  if (d.choices?.[0]?.finish_reason === "length") res.data.candidates[0].finishReason = "MAX_TOKENS";
  return res;
}

// Fallback model, used when the main one is overloaded. Set GEMINI_FALLBACK_MODEL to enable.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL;
function urlFor(model) {
  return "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
}

async function callGemini(geminiBody) {
  const started = Date.now();
  const BUDGET_MS = 50000; // stay under Vercel's 60 s limit
  const models = [MODEL, ...(FALLBACK_MODEL && FALLBACK_MODEL !== MODEL ? [FALLBACK_MODEL] : [])];
  let result = { status: 503, ok: false, data: { error: { message: "Gemini is busy. Try again in a minute." } } };
  for (let attempt = 0; attempt < 4; attempt++) {
    const left = BUDGET_MS - (Date.now() - started);
    if (left < 4000) break;
    const model = models[attempt % models.length];
    try {
      result = await callGeminiOnce(geminiBody, model, Math.min(25000, left));
    } catch (err) {
      result = { status: 504, ok: false, data: { error: { message: "Gemini took too long to answer. Try again." } } };
    }
    if (![500, 502, 503, 504].includes(result.status)) return result;
    console.log("Gemini busy (" + result.status + ") on " + model + ", try " + (attempt + 1));
    await new Promise((r) => setTimeout(r, 1000));
  }
  return result;
}

async function callGeminiOnce(geminiBody, model, timeoutMs) {
  if (API_KEY) {
    try {
      const first = await callGeminiOnly(geminiBody);
      if (first.ok || !FB_KEY || !(first.status === 429 || first.status >= 500)) return first;
      console.log("Gemini " + first.status + ", trying backup provider");
    } catch (error) {
      if (!FB_KEY) throw error;
      console.log("Gemini unreachable, trying backup provider");
    }
  }
  if (!FB_KEY) throw new Error("No AI key is set (GEMINI_API_KEY or GROQ_API_KEY).");
  return callFallback(geminiBody);
}

async function callGeminiOnly(geminiBody) {
  const upstream = await fetch(urlFor(model), {
    signal: AbortSignal.timeout(timeoutMs),
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
  const data = await upstream.json().catch(() => ({ error: { message: "Gemini returned an error page (status " + upstream.status + ")" } }));
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
    systemInstruction: { parts: [{ text: (appBody.system ?? "") + (shots.length > 0 ? "\n\n" + CHART_GUIDE : "") }] },
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
const PLAN_PROMPT = `${CHART_GUIDE}
These screenshots show ONE forex/CFD trade (chart with lines, positions tab, order ticket or history). Combine them and read: pair (symbol, e.g. XAUUSD), direction ("buy" or "sell"), entry_price, stop_loss (S/L), take_profit (T/P), size (lots), notes (one short line of anything useful). Use null for anything not clearly visible. Never invent or estimate numbers. Reply with JSON only: {"pair":..,"direction":..,"entry_price":..,"stop_loss":..,"take_profit":..,"size":..,"notes":..}`;

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
  return `${CHART_GUIDE}
You turn a trader's spoken or typed message into a journal record. Today is ${new Date().toISOString().slice(0, 10)}.
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
  if (!API_KEY && !FB_KEY) { sendJson(res, 500, { error: { message: "GEMINI_API_KEY is not set on Vercel." } }); return; }
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
