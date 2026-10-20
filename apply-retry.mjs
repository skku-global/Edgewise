// Run from the project root:  node apply-retry.mjs
// Makes both proxies retry when Gemini answers 500/502/503/504 (overloaded).
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const FIND1 = "async function callGemini(geminiBody) {";
const REPL1 = `async function callGemini(geminiBody) {
  // Gemini sometimes answers 503 "overloaded". Wait a moment and try again (up to 3 tries).
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    result = await callGeminiOnce(geminiBody);
    if (![500, 502, 503, 504].includes(result.status)) return result;
    console.log(\`Gemini busy (\${result.status}), retry \${attempt + 1} of 2...\`);
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return result;
}

async function callGeminiOnce(geminiBody) {`;
const FIND2 = "const data = await upstream.json();";
const REPL2 = 'const data = await upstream.json().catch(() => ({ error: { message: "Gemini returned an error page (status " + upstream.status + ")" } }));';

let failed = false;
for (const file of ["scripts/gemini-proxy.mjs", "api/gateway.mjs"]) {
  let raw;
  try { raw = readFileSync(file, "utf8"); } catch { console.log(`SKIP ${file}: not found`); failed = true; continue; }
  if (raw.includes("callGeminiOnce")) { console.log(`SKIP ${file}: already patched`); continue; }
  const crlf = raw.includes("\r\n");
  let src = crlf ? raw.replace(/\r\n/g, "\n") : raw;
  const c1 = src.split(FIND1).length - 1, c2 = src.split(FIND2).length - 1;
  if (c1 !== 1 || c2 !== 1) { console.log(`FAIL ${file}: expected lines not found (${c1}, ${c2}). Untouched.`); failed = true; continue; }
  src = src.split(FIND1).join(REPL1).split(FIND2).join(REPL2);
  writeFileSync(file, crlf ? src.replace(/\n/g, "\r\n") : src);
  try { execFileSync(process.execPath, ["--check", file], { stdio: "pipe" }); console.log(`OK   ${file}`); }
  catch (e) { writeFileSync(file, raw); console.log(`FAIL ${file}: syntax check failed, restored.\n${e.stderr}`); failed = true; }
}
process.exit(failed ? 1 : 0);
