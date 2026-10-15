/**
 * Save things by talking to the Coach.
 *
 * You say or type something ("I bought XAUUSD at 2650, stop 2640, I felt rushed"),
 * the AI turns it into a record, the chat SHOWS you that record, and only when
 * you press Save does anything reach your journal.
 *
 * Four kinds:
 *   trade  a closed trade        -> `trades`
 *   plan   a trade you plan/hold -> `journal_entries` (graded against your rules)
 *   note   feelings before/after -> added to your latest plan, or latest trade
 *   none   a question, nothing to save
 *
 * The AI only reads what you said. Lot sizes, grades and flags are still worked
 * out by plain arithmetic in this app.
 */

import type { PickedImage } from '@/lib/coach-vision';
import { formatSigned } from '@/lib/format';
import {
  computeFlags,
  gradePlan,
  listOpenEntries,
  loadRules,
  updateEntry,
  usualLotSize,
  type PlanInput,
} from '@/lib/journal';
import { MAX_IMAGES, readAsBase64 } from '@/lib/plan-vision';
import { loadSizing, resolvePointValue } from '@/lib/sizing';
import { supabase } from '@/lib/supabase';
import { computeProfitLoss } from '@/lib/trade-math';

export type ChatEntry = {
  kind: 'trade' | 'plan' | 'note' | 'none';
  pair: string | null;
  direction: 'buy' | 'sell' | null;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  size: number | null;
  profit_loss: number | null;
  reasons: string;
  feelings: string;
  phase: 'before' | 'after' | null;
  summary: string;
};

const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

const num = (value: unknown): number | null =>
  value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
    ? null
    : Number(value);

/** Words that mean "put this in my journal" rather than "answer me". */
export function looksLikeSave(text: string): boolean {
  return /^\s*(log|save|add|journal|record|note)\b/i.test(text);
}

export async function extractEntry(text: string, images: PickedImage[]): Promise<ChatEntry> {
  const base = (process.env.EXPO_PUBLIC_CLAUDE_PROXY_URL ?? '').trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error('Saving through chat needs the proxy. Set EXPO_PUBLIC_CLAUDE_PROXY_URL and restart the app.');
  }

  const encoded = [];
  let total = 0;
  for (const image of images.slice(0, MAX_IMAGES)) {
    const item = await readAsBase64(image);
    total += item.bytes;
    encoded.push({ mime: item.mime, data: item.data });
  }
  if (total > MAX_TOTAL_BYTES) {
    throw new Error('Those screenshots are too large together (over 12 MB). Attach fewer or smaller ones.');
  }

  // STEP 1-4: endpoint, method, headers, body
  const response = await fetch(base + '/v1/extract-entry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, images: encoded }),
  });

  // STEP 5: 400 = unsupported image, 404 = old proxy, 429 = free limit, 502 = no internet on the proxy.
  const raw = await response.text();
  if (!response.ok) {
    let message: string | null = null;
    try {
      message = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? null;
    } catch {
      // not JSON
    }
    throw new Error(message ?? `Save error ${response.status}`);
  }

  const { text: body = '' } = JSON.parse(raw) as { text?: string };
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end < start) {
    throw new Error('Could not understand that. Try saying it a bit more clearly.');
  }
  const p = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;

  const kind = p.kind === 'trade' || p.kind === 'plan' || p.kind === 'note' ? p.kind : 'none';
  return {
    kind,
    pair: p.pair ? String(p.pair).trim().toUpperCase() : null,
    direction: p.direction === 'buy' || p.direction === 'sell' ? p.direction : null,
    entry_price: num(p.entry_price),
    exit_price: num(p.exit_price),
    stop_loss: num(p.stop_loss),
    take_profit: num(p.take_profit),
    size: num(p.size),
    profit_loss: num(p.profit_loss),
    reasons: p.reasons ? String(p.reasons) : '',
    feelings: p.feelings ? String(p.feelings) : '',
    phase: p.phase === 'before' || p.phase === 'after' ? p.phase : null,
    summary: p.summary ? String(p.summary) : '',
  };
}

const KIND_LABEL: Record<ChatEntry['kind'], string> = {
  trade: 'A closed trade',
  plan: 'A trade plan',
  note: 'A note',
  none: '',
};

/** The lines shown on the confirm card. */
export function describeEntry(entry: ChatEntry): { title: string; lines: string[] } {
  const lines: string[] = [];
  const add = (label: string, value: string | number | null) => {
    if (value !== null && value !== '') lines.push(`${label}: ${value}`);
  };
  if (entry.kind !== 'note') {
    add('Pair', entry.pair);
    add('Direction', entry.direction);
    add('Entry', entry.entry_price);
    if (entry.kind === 'trade') add('Exit', entry.exit_price);
    add('Stop loss', entry.stop_loss);
    add('Take profit', entry.take_profit);
    add('Lots', entry.size);
    if (entry.kind === 'trade') add('Result', entry.profit_loss);
  } else {
    add('When', entry.phase === 'before' ? 'Before a trade' : 'After a trade');
    add('Pair', entry.pair);
  }
  add('Reasons', entry.reasons);
  add('Feelings', entry.feelings);
  return { title: KIND_LABEL[entry.kind], lines };
}

/** What is still missing before this can be saved, or null when it is complete. */
export function missingFor(entry: ChatEntry): string | null {
  if (entry.kind === 'trade') {
    const need: string[] = [];
    if (!entry.pair) need.push('the pair');
    if (!entry.direction) need.push('buy or sell');
    if (entry.entry_price === null) need.push('the entry price');
    if (entry.exit_price === null) need.push('the exit price');
    if (entry.size === null) need.push('the lot size');
    return need.length ? `To save this trade I still need ${need.join(', ')}. Say it again with those.` : null;
  }
  if (entry.kind === 'plan') {
    const need: string[] = [];
    if (!entry.pair) need.push('the pair');
    if (!entry.direction) need.push('buy or sell');
    return need.length ? `To save this plan I still need ${need.join(' and ')}. Say it again with those.` : null;
  }
  if (entry.kind === 'note') {
    return (entry.feelings || entry.reasons).trim() ? null : 'There was nothing to write in that note.';
  }
  return null;
}

const append = (existing: string | null, addition: string) =>
  [existing?.trim(), addition.trim()].filter(Boolean).join('\n');

/** Saves a confirmed entry. Returns a one-line message for the chat. Throws on failure. */
export async function saveChatEntry(entry: ChatEntry): Promise<string> {
  const missing = missingFor(entry);
  if (missing) {
    throw new Error(missing);
  }

  /* ---- closed trade ---- */
  if (entry.kind === 'trade') {
    const pl =
      entry.profit_loss ??
      computeProfitLoss({
        direction: entry.direction!,
        entry_price: entry.entry_price!,
        exit_price: entry.exit_price!,
        size: entry.size!,
      });
    const notes =
      [
        entry.reasons && `Why: ${entry.reasons}`,
        entry.feelings && `Felt: ${entry.feelings}`,
        entry.stop_loss !== null && `Stop ${entry.stop_loss}`,
        entry.take_profit !== null && `Target ${entry.take_profit}`,
      ]
        .filter(Boolean)
        .join('\n') || null;

    const { error } = await supabase.from('trades').insert([
      {
        pair: entry.pair,
        direction: entry.direction,
        entry_price: entry.entry_price,
        exit_price: entry.exit_price,
        size: entry.size,
        profit_loss: pl,
        setup_type: null,
        notes,
      },
    ]);
    if (error) throw error;
    return `Saved: ${entry.pair} ${entry.direction}, ${formatSigned(pl)}.`;
  }

  /* ---- plan: graded against your own rules, with the arithmetic flags ---- */
  if (entry.kind === 'plan') {
    const plan: PlanInput = {
      pair: entry.pair!,
      direction: entry.direction!,
      planned_entry: entry.entry_price,
      stop_loss: entry.stop_loss,
      take_profit: entry.take_profit,
      size: entry.size,
      reasons: entry.reasons,
      feelings_before: entry.feelings,
    };

    let grade: string | null = null;
    let results: unknown[] = [];
    let summary = '';
    let flags: string[] = [];
    try {
      const sizing = await loadSizing();
      const point = await resolvePointValue(plan.pair, sizing);
      const riskCheck =
        sizing.riskAmount && point ? { riskAmount: sizing.riskAmount, valuePerUnit: point.value } : undefined;
      flags = computeFlags(plan, await usualLotSize(), riskCheck);
      const graded = await gradePlan(plan, await loadRules(), flags);
      grade = graded.grade;
      results = graded.results;
      summary = graded.summary;
    } catch (err) {
      // Grading is a bonus. A failure must not lose the plan you just told us.
      console.error(err);
    }

    const { error } = await supabase.from('journal_entries').insert([
      {
        ...plan,
        grade,
        rules_result: results,
        flags,
        ai_summary: summary || null,
      },
    ]);
    if (error) throw error;
    return grade
      ? `Plan saved. Grade ${grade}${flags.length ? ` (${flags.length} warning${flags.length > 1 ? 's' : ''}, see Open plans)` : ''}.`
      : 'Plan saved, but it could not be graded right now. It is in Open plans.';
  }

  /* ---- note: before / after ---- */
  const text = (entry.feelings || entry.reasons).trim();

  if (entry.phase === 'before') {
    if (entry.pair && entry.direction) {
      const { error } = await supabase.from('journal_entries').insert([
        {
          pair: entry.pair,
          direction: entry.direction,
          planned_entry: entry.entry_price,
          stop_loss: entry.stop_loss,
          take_profit: entry.take_profit,
          size: entry.size,
          reasons: entry.reasons,
          feelings_before: entry.feelings,
        },
      ]);
      if (error) throw error;
      return `Saved how you felt before your ${entry.pair} trade, as a plan in Open plans.`;
    }
    const open = (await listOpenEntries())[0];
    if (!open) {
      throw new Error('Tell me the pair and buy or sell as well, so I can start a plan to put that in.');
    }
    await updateEntry(open.id, { feelings_before: append(open.feelings_before, text) });
    return `Added to how you felt before your ${open.pair} plan.`;
  }

  // after
  const open = (await listOpenEntries())[0];
  if (open) {
    await updateEntry(open.id, { feelings_after: append(open.feelings_after, text) });
    return `Added to what happened after your ${open.pair} plan.`;
  }
  const { data, error } = await supabase
    .from('trades')
    .select('id, pair, notes')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const latest = data?.[0] as { id: number; pair: string; notes: string | null } | undefined;
  if (!latest) {
    throw new Error('You have no trade or plan to attach that to yet.');
  }
  const { error: updateError } = await supabase
    .from('trades')
    .update({ notes: append(latest.notes, `After: ${text}`) })
    .eq('id', latest.id);
  if (updateError) throw updateError;
  return `Added to your latest trade (${latest.pair}).`;
}
