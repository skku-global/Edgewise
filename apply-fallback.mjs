// Run from the project root:  node apply-fallback.mjs
// Upgrades the retry in both proxies:
//  - each try to Gemini times out after 25 s (so Vercel does not hit its own time limit and send 504)
//  - the whole call stops after about 50 s
//  - if GEMINI_FALLBACK_MODEL is set, retries alternate to that model when the main one is overloaded
// Run apply-retry.mjs first if you have not.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const NEW_WRAPPER = `// Fallback model, used when the main one is overloaded. Set GEMINI_FALLBACK_MODEL to enable.
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

async function callGeminiOnce(geminiBody, model, timeoutMs) {`;

let failed = false;
for (const file of ["scripts/gemini-proxy.mjs", "api/gateway.mjs"]) {
  let raw;
  try { raw = readFileSync(file, "utf8"); } catch { console.log(`SKIP ${file}: not found`); failed = true; continue; }
  if (raw.includes("FALLBACK_MODEL")) { console.log(`SKIP ${file}: already patched`); continue; }
  if (!raw.includes("callGeminiOnce")) { console.log(`FAIL ${file}: run apply-retry.mjs first.`); failed = true; continue; }
  const crlf = raw.includes("\r\n");
  let src = crlf ? raw.replace(/\r\n/g, "\n") : raw;
  const re = /async function callGemini\(geminiBody\) \{[\s\S]*?async function callGeminiOnce\(geminiBody\) \{/;
  const f2 = "const upstream = await fetch(UPSTREAM, {";
  if (!re.test(src) || src.split(f2).length - 1 !== 1) { console.log(`FAIL ${file}: expected code not found. Untouched.`); failed = true; continue; }
  src = src.replace(re, () => NEW_WRAPPER);
  src = src.split(f2).join("const upstream = await fetch(urlFor(model), {\n    signal: AbortSignal.timeout(timeoutMs),");
  writeFileSync(file, crlf ? src.replace(/\n/g, "\r\n") : src);
  try { execFileSync(process.execPath, ["--check", file], { stdio: "pipe" }); console.log(`OK   ${file}`); }
  catch (e) { writeFileSync(file, raw); console.log(`FAIL ${file}: syntax check failed, restored.\n${e.stderr}`); failed = true; }
}
process.exit(failed ? 1 : 0);
