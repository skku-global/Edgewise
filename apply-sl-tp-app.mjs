// Run from the project root:  node apply-sl-tp-app.mjs
// Adds Stop loss / Take profit to "Add from a screenshot" and mentions TradingView in the prompts.
// Each file is all-or-nothing: if any expected line is missing, that file is left untouched.
import { readFileSync, writeFileSync } from "node:fs";

const PLAN = [
  {
    file: "src/lib/journal.ts",
    edits: [
      [
        "ExtractedTrade type",
        `  profit_loss: number | null;
  notes: string | null;
};`,
        `  profit_loss: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  notes: string | null;
};`,
      ],
      [
        "extractTradeFromImage return",
        `    profit_loss: num(parsed.profit_loss),
    notes: parsed.notes ? String(parsed.notes) : null,`,
        `    profit_loss: num(parsed.profit_loss),
    stop_loss: num(parsed.stop_loss),
    take_profit: num(parsed.take_profit),
    notes: parsed.notes ? String(parsed.notes) : null,`,
      ],
    ],
  },
  {
    file: "src/components/screenshot-trade-sheet.tsx",
    edits: [
      [
        "FormState type",
        `  profit_loss: string;
  setup_type: string | null;`,
        `  profit_loss: string;
  stop_loss: string;
  take_profit: string;
  setup_type: string | null;`,
      ],
      [
        "initialForm",
        `  profit_loss: '',
  setup_type: null,`,
        `  profit_loss: '',
  stop_loss: '',
  take_profit: '',
  setup_type: null,`,
      ],
      [
        "fill form from screenshot",
        `        profit_loss: text(found.profit_loss),
        setup_type: null,`,
        `        profit_loss: text(found.profit_loss),
        stop_loss: text(found.stop_loss ?? null),
        take_profit: text(found.take_profit ?? null),
        setup_type: null,`,
      ],
      [
        "validation",
        `    if (form.profit_loss.trim() && !Number.isFinite(Number(form.profit_loss))) {`,
        `    for (const key of ['stop_loss', 'take_profit'] as const) {
      if (form[key].trim()) {
        const value = Number(form[key]);
        if (!Number.isFinite(value) || value <= 0) found[key] = 'Number above 0';
      }
    }
    if (form.profit_loss.trim() && !Number.isFinite(Number(form.profit_loss))) {`,
      ],
      [
        "save to trades table",
        `            profit_loss: pl,
            setup_type: form.setup_type,`,
        `            profit_loss: pl,
            stop_loss: form.stop_loss.trim() ? Number(form.stop_loss) : null,
            take_profit: form.take_profit.trim() ? Number(form.take_profit) : null,
            setup_type: form.setup_type,`,
      ],
      [
        "Stop loss / Take profit fields",
        `          <View style={styles.row}>
            <Field
              label="Size (lots)"`,
        `          <View style={styles.row}>
            <Field
              label="Stop loss"
              value={form.stop_loss}
              onChangeText={(value) => set('stop_loss', value)}
              keyboardType="decimal-pad"
              numeric
              error={errors.stop_loss}
              hint="Optional"
              containerStyle={styles.flexOne}
            />
            <Field
              label="Take profit"
              value={form.take_profit}
              onChangeText={(value) => set('take_profit', value)}
              keyboardType="decimal-pad"
              numeric
              error={errors.take_profit}
              hint="Optional"
              containerStyle={styles.flexOne}
            />
          </View>

          <View style={styles.row}>
            <Field
              label="Size (lots)"`,
      ],
      [
        "subtitle wording",
        "Upload a MetaTrader screenshot. Check the numbers before saving.",
        "Upload a MetaTrader or TradingView screenshot. Check the numbers before saving.",
      ],
    ],
  },
  {
    file: "src/lib/coach-vision.ts",
    edits: [
      [
        "coach wording",
        "usually MetaTrader charts, trades, or history",
        "usually MetaTrader or TradingView charts, trades, or history",
      ],
    ],
  },
  ...["scripts/gemini-proxy.mjs", "api/gateway.mjs"].map((file) => ({
    file,
    edits: [
      [
        "extract prompt wording",
        '"This is a screenshot from MetaTrader (a trade history list, a closed trade, or an open position). "',
        '"This is a screenshot from MetaTrader or TradingView (a trade history list, a closed trade, an open position, or a chart with trade lines). "',
      ],
    ],
  })),
];

let failed = false;
for (const { file, edits } of PLAN) {
  let raw;
  try { raw = readFileSync(file, "utf8"); } catch { console.log(`SKIP ${file}: not found (run from the project root)`); failed = true; continue; }
  const crlf = raw.includes("\r\n");
  let src = crlf ? raw.replace(/\r\n/g, "\n") : raw;
  let ok = true, changed = 0;
  for (const [name, find, replace] of EDITS_OF(edits)) {
    if (src.includes(replace)) { continue; } // already applied
    const n = src.split(find).length - 1;
    if (n !== 1) { console.log(`FAIL ${file}: "${name}" matched ${n} times (need 1). File left untouched.`); ok = false; break; }
    src = src.split(find).join(replace);
    changed++;
  }
  if (!ok) { failed = true; continue; }
  if (changed === 0) { console.log(`SKIP ${file}: already patched`); continue; }
  writeFileSync(file, crlf ? src.replace(/\n/g, "\r\n") : src);
  console.log(`OK   ${file} (${changed} edits)`);
}
function EDITS_OF(e) { return e; }
process.exit(failed ? 1 : 0);
