// Adds: log_method on every insert, the closed-entry guard, and the types.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

function patch(file, pairs) {
  if (!existsSync(file)) return console.log('SKIPPED (missing): ' + file);
  let s = readFileSync(file, 'utf8');
  const crlf = s.includes('\r\n');
  if (crlf) s = s.replace(/\r\n/g, '\n');
  let changed = false;
  for (const [from, to, label] of pairs) {
    if (s.includes("log_method") && label === 'once-check') continue;
    if (!s.includes(from)) { console.log('SKIPPED (not found): ' + file + ' -> ' + label); continue; }
    s = s.replace(from, () => to);
    changed = true;
  }
  if (changed) writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  console.log((changed ? 'patched: ' : 'unchanged: ') + file);
}
const has = (file, text) => existsSync(file) && readFileSync(file, 'utf8').includes(text);

if (!has('src/components/add-trade-sheet.tsx', "log_method: 'hand'"))
  patch('src/components/add-trade-sheet.tsx', [[
    "notes: form.notes.trim() || null,\n          },", "notes: form.notes.trim() || null,\n            log_method: 'hand',\n          },", 'insert']]);
if (!has('src/components/screenshot-trade-sheet.tsx', "log_method: 'screenshot'"))
  patch('src/components/screenshot-trade-sheet.tsx', [[
    "notes: form.notes.trim() || null,\n          },", "notes: form.notes.trim() || null,\n            log_method: 'screenshot',\n          },", 'insert']]);
if (!has('src/components/history-import-sheet.tsx', "log_method: 'history'"))
  patch('src/components/history-import-sheet.tsx', [[
    "setup_type: null,\n        notes: trade.closed_at", "setup_type: null,\n        log_method: 'history',\n        notes: trade.closed_at", 'insert']]);
if (!has('src/components/import-report-sheet.tsx', "log_method: 'report'"))
  patch('src/components/import-report-sheet.tsx', [[
    ".upsert(chunk, {", ".upsert(chunk.map((row) => ({ ...row, log_method: 'report' })), {", 'upsert']]);
if (!has('src/lib/chat-save.ts', "log_method: 'chat'"))
  patch('src/lib/chat-save.ts', [
    ["setup_type: null,\n        notes,\n      },", "setup_type: null,\n        notes,\n        log_method: 'chat',\n      },", 'trade insert'],
    ["...plan,\n        grade,", "...plan,\n        log_method: 'chat',\n        grade,", 'plan insert'],
    ["pair: entry.pair,\n          direction: entry.direction,\n          planned_entry: entry.entry_price,", "pair: entry.pair,\n          log_method: 'chat',\n          direction: entry.direction,\n          planned_entry: entry.entry_price,", 'before-plan insert'],
  ]);
if (!has('src/lib/journal.ts', "log_method: 'plan'"))
  patch('src/lib/journal.ts', [
    ["...plan,\n        pair: plan.pair.trim().toUpperCase(),", "...plan,\n        log_method: 'plan',\n        pair: plan.pair.trim().toUpperCase(),", 'insertEntry'],
    [".update(patch)\n    .eq('id', id)\n", ".update(patch)\n    .eq('id', id)\n    .neq('status', 'closed') // a closed trade can never be edited\n", 'closed guard'],
  ]);
if (!has('src/lib/trade-table.ts', 'log_method'))
  patch('src/lib/trade-table.ts', [
    ["setup_type, notes, profit_loss, created_at';", "setup_type, notes, profit_loss, created_at, log_method';", 'columns'],
    ["  profit_loss: number | null;\n  created_at: string;", "  profit_loss: number | null;\n  log_method?: string | null;\n  created_at: string;", 'type'],
  ]);
if (!has('src/lib/trade-stats.ts', 'log_method'))
  patch('src/lib/trade-stats.ts', [[
    "  setup_type: string | null;\n  created_at: string;\n  pl: number;", "  setup_type: string | null;\n  log_method?: string | null;\n  source?: string | null;\n  created_at: string;\n  pl: number;", 'type']]);
console.log('Done.');
