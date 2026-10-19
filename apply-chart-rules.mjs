// Run from the project root:  node apply-chart-rules.mjs
// Patches scripts/gemini-proxy.mjs and api/gateway.mjs the same way.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const FILES = ["scripts/gemini-proxy.mjs", "api/gateway.mjs"];

const RULE_LINES = [
  "CHART READING RULES (MetaTrader 5 and TradingView screenshots)",
  "Goal: when the screenshot is a chart, read direction, entry, stop loss (SL) and take profit (TP) from it.",
  "Trust evidence in this order:",
  "1. Text labels on the chart or price scale: sl, tp, SL, TP, Stop, Target, buy, sell, a ticket like #123456 buy 0.10, buy limit, sell stop.",
  "2. Position relative to entry: a BUY has SL below entry and TP above; a SELL has SL above entry and TP below.",
  "3. Colour, as a hint only. Traders change colours, so never decide from colour alone.",
  "MetaTrader 5: an open or pending order draws a dotted horizontal line at its entry price, labelled with the ticket, buy or sell, and lots. Its SL and TP are dotted horizontal lines labelled sl and tp (often red by default).",
  "TradingView: the Long Position and Short Position tools draw two shaded zones from the entry line. Red or pink is the stop (risk) zone, green or teal is the target (reward) zone, and the entry is the line where they meet. Long: target zone above entry, stop zone below. Short: target zone below entry, stop zone above. The tool's own labels often show exact prices, so prefer them. For plain horizontal lines, use their labels first, then position, then colour.",
  "Reading numbers: take each value from the price scale on the right edge at the height of the line or zone edge, or from an exact price printed in a label. Never estimate from pixel position alone.",
  "Check: BUY needs SL < entry < TP; SELL needs TP < entry < SL. If the check fails, or a level is not clearly readable, use null for that field and say why in the notes. Never invent a value. If the chart shows no trade levels, leave them null.",
  "If the screenshot is not a chart (history list, order ticket, positions tab), read the numbers printed there instead.",
  "In a chat answer (not JSON), say plainly when a level is not clear instead of guessing.",
];

const CONST_SRC =
  "// Shared chart-reading instructions (MT5 + TradingView). Added by apply-chart-rules.mjs\n" +
  "const CHART_RULES = [\n" +
  RULE_LINES.map((l) => "  " + JSON.stringify(l) + ",").join("\n") +
  '\n].join("\\n");';

const REF = "$" + "{CHART_RULES}";

const EDITS = [
  [
    "CHART_RULES constant",
    'const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);',
    'const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);\n\n' + CONST_SRC,
  ],
  [
    "Add trade: stop_loss/take_profit keys",
    `'"profit_loss" (number, negative for a loss, or null), ' +`,
    `'"profit_loss" (number, negative for a loss, or null), ' +\n  '"stop_loss" (number or null), "take_profit" (number or null), ' +`,
  ],
  [
    "Add trade: chart rules",
    '"Use null for anything you cannot read clearly. Never guess or invent a number.";',
    '"Use null for anything you cannot read clearly. Never guess or invent a number. " +\n  "If it is a chart with trade lines, also read stop_loss and take_profit. " +\n  CHART_RULES;',
  ],
  [
    "Plan a trade",
    'Never invent or estimate numbers. Reply with JSON only: {"pair"',
    "Never invent or estimate numbers.\n" + REF + '\nReply with JSON only: {"pair"',
  ],
  [
    "Add from chat / voice entry",
    "Numbers from screenshots must be ones you can read.",
    "Numbers from screenshots must be ones you can read.\n" + REF + "\n",
  ],
  [
    "Coach chat",
    'systemInstruction: { parts: [{ text: appBody.system ?? "" }] },',
    'systemInstruction: { parts: [{ text: (appBody.system ?? "") + (shots.length > 0 ? "\\n\\n" + CHART_RULES : "") }] },',
  ],
];

let failed = false;
for (const file of FILES) {
  let src;
  try { src = readFileSync(file, "utf8"); } catch { console.log(`SKIP ${file}: not found (run from the project root)`); failed = true; continue; }
  if (src.includes("CHART_RULES")) { console.log(`SKIP ${file}: already patched`); continue; }
  const original = src;
  let ok = true;
  for (const [name, find, replace] of EDITS) {
    const n = src.split(find).length - 1;
    if (n !== 1) { console.log(`FAIL ${file}: "${name}" matched ${n} times (need 1). Nothing written.`); ok = false; break; }
    src = src.split(find).join(replace);
  }
  if (!ok) { failed = true; continue; }
  writeFileSync(file, src);
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    console.log(`OK   ${file}`);
  } catch (e) {
    writeFileSync(file, original);
    console.log(`FAIL ${file}: syntax check failed, restored original.\n${e.stderr}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
