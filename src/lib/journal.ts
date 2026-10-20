/**
 * Trade journal logic: rules, flags, grading, check-ins, reviews, screenshots.
 *
 * Every AI call goes through your own proxy (scripts/gemini-proxy.mjs), so the
 * key never reaches the app. The 5 API steps for each call:
 *   1 endpoint (proxy + route)  2 method (POST)  3 headers (content-type)
 *   4 body (JSON, or raw image bytes)  5 response (status code, then data)
 *
 * What is deliberately NOT left to the AI:
 *   - the grade: counted from how many of YOUR rules were met
 *   - the warnings: lot size, missing stop, bad risk:reward are plain arithmetic
 * The AI only judges "do the written reasons show this rule?" and writes words.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

export type Direction = 'buy' | 'sell';
export type EntryStatus = 'planned' | 'open' | 'closed';

export type RuleResult = { rule: string; met: boolean; evidence: string };
export type Checkin = { at: string; text: string; reply?: string };

export type JournalEntry = {
  id: number;
  created_at: string;
  status: EntryStatus;
  pair: string;
  direction: Direction;
  planned_entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  size: number | null;
  reasons: string;
  feelings_before: string;
  grade: string | null;
  rules_result: RuleResult[];
  flags: string[];
  ai_summary: string | null;
  checkins: Checkin[];
  result_pl: number | null;
  feelings_after: string | null;
  review: string | null;
  closed_at: string | null;
};

export type PlanInput = {
  pair: string;
  direction: Direction;
  planned_entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  size: number | null;
  reasons: string;
  feelings_before: string;
};

/* ------------------------------------------------------------------ */
/* Rules (stored on the phone)                                         */
/* ------------------------------------------------------------------ */

const RULES_KEY = 'edgewise.rules.v1';

export const DEFAULT_RULES = [
  'The trade is in the direction of the higher-timeframe trend',
  'Entry is at a clear level or zone (support, resistance, order block)',
  'There was a confirmation before entry',
  'The stop loss is at a logical level, not squeezed tight',
  'Risk to reward is at least 1 to 2',
  'The lot size follows my normal risk',
];

export function parseRules(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean);
}

export async function loadRules(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RULES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((r) => typeof r === 'string') && parsed.length > 0) {
        return parsed as string[];
      }
    }
  } catch (err) {
    console.error(err);
  }
  return DEFAULT_RULES;
}

export async function saveRules(rules: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch (err) {
    console.error(err);
  }
}

/* ------------------------------------------------------------------ */
/* Plain-arithmetic checks                                             */
/* ------------------------------------------------------------------ */

/** Median lot size of your last 30 trades, or null when there is too little history. */
export async function usualLotSize(): Promise<number | null> {
  const { data, error } = await supabase
    .from('trades')
    .select('size')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error || !data) {
    return null;
  }
  const sizes = (data as { size: unknown }[])
    .map((row) => Number(row.size))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (sizes.length < 5) {
    return null;
  }
  const mid = Math.floor(sizes.length / 2);
  return sizes.length % 2 ? sizes[mid] : (sizes[mid - 1] + sizes[mid]) / 2;
}

export function computeFlags(
  plan: PlanInput,
  usual: number | null,
  /** Your fixed risk and what 1.00 of price move is worth per lot, when known. */
  riskCheck?: { riskAmount: number; valuePerUnit: number },
): string[] {
  const flags: string[] = [];

  if (plan.stop_loss === null) {
    flags.push('No stop loss set');
  }

  if (riskCheck && plan.planned_entry !== null && plan.stop_loss !== null && plan.size) {
    const loss = plan.size * Math.abs(plan.planned_entry - plan.stop_loss) * riskCheck.valuePerUnit;
    if (loss > riskCheck.riskAmount * 1.25) {
      flags.push(
        `This lot size would lose about $${loss.toFixed(2)} at your stop, above your fixed $${riskCheck.riskAmount}`,
      );
    }
  }

  if (usual && plan.size && plan.size > usual * 2) {
    flags.push(
      `Lot size ${plan.size} is ${(plan.size / usual).toFixed(1)}x your usual ${usual}`,
    );
  }

  const { planned_entry: entry, stop_loss: stop, take_profit: target, direction } = plan;
  if (entry !== null && stop !== null) {
    const wrongSide = direction === 'buy' ? stop >= entry : stop <= entry;
    if (wrongSide) {
      flags.push('The stop loss is on the wrong side of the entry');
    } else if (target !== null) {
      const risk = Math.abs(entry - stop);
      const reward = Math.abs(target - entry);
      if (risk > 0 && reward / risk < 1) {
        flags.push(`Risk to reward is only 1 to ${(reward / risk).toFixed(1)}`);
      }
    }
  }

  return flags;
}

const GRADE_ORDER = ['D', 'C', 'C+', 'B', 'B+', 'A', 'A+'];

/** A+ = every rule met. Counted, so the same answers always give the same grade. */
export function gradeFromResults(results: RuleResult[]): string {
  if (results.length === 0) {
    return 'D';
  }
  const share = results.filter((r) => r.met).length / results.length;
  if (share >= 0.9) return 'A+';
  if (share >= 0.75) return 'A';
  if (share >= 0.6) return 'B+';
  if (share >= 0.45) return 'B';
  if (share >= 0.3) return 'C+';
  if (share > 0) return 'C';
  return 'D';
}

/** Any warning flag caps the grade at C+, whatever the reasons said. */
export function capGrade(grade: string, flags: string[]): string {
  if (flags.length === 0) {
    return grade;
  }
  return GRADE_ORDER.indexOf(grade) > GRADE_ORDER.indexOf('C+') ? 'C+' : grade;
}

/* ------------------------------------------------------------------ */
/* Talking to the proxy                                                */
/* ------------------------------------------------------------------ */

function proxyBase(): string {
  const base = (process.env.EXPO_PUBLIC_CLAUDE_PROXY_URL ?? '').trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error('The AI proxy is not set. Set EXPO_PUBLIC_CLAUDE_PROXY_URL and restart the app.');
  }
  return base;
}

function errorMessage(raw: string): string | null {
  try {
    return (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? null;
  } catch {
    return null;
  }
}

/** One question in, plain text out. */
async function askModel(system: string, prompt: string, maxTokens = 4000): Promise<string> {
  // STEP 1-4: endpoint, method, headers, body
  const response = await fetch(proxyBase() + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
    }),
  });

  // STEP 5: status code first. 404 = wrong model name, 429 = free limit, 502 = proxy down.
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(errorMessage(raw) ?? `AI error ${response.status}`);
  }
  const data = JSON.parse(raw) as { content?: { type: string; text?: string }[] };
  return (data.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
    .trim();
}

function parseJson<T>(text: string): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('The AI did not return a usable answer. Try again.');
  }
  return JSON.parse(text.slice(start, end + 1)) as T;
}

function describePlan(plan: PlanInput): string {
  const show = (v: number | null) => (v === null ? 'not set' : String(v));
  return [
    `Pair: ${plan.pair}`,
    `Direction: ${plan.direction}`,
    `Planned entry: ${show(plan.planned_entry)}`,
    `Stop loss: ${show(plan.stop_loss)}`,
    `Take profit: ${show(plan.take_profit)}`,
    `Lot size: ${show(plan.size)}`,
    `Reasons they wrote: ${plan.reasons || '(none)'}`,
    `How they feel before the trade: ${plan.feelings_before || '(not said)'}`,
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Grading                                                             */
/* ------------------------------------------------------------------ */

export type GradeOutcome = {
  grade: string;
  results: RuleResult[];
  summary: string;
};

export async function gradePlan(
  plan: PlanInput,
  rules: string[],
  flags: string[],
): Promise<GradeOutcome> {
  const system =
    "You check a trader's written reasons against THEIR OWN rules. For each rule, decide if the " +
    'written reasons clearly show it was met. Vague claims ("looks good", "feels right") do not ' +
    'count. Give a short quote as evidence, or say what is missing. Do not judge whether the trade ' +
    'will win and never tell them to take or skip it. Return ONLY JSON in this shape: ' +
    '{"results":[{"rule":string,"met":boolean,"evidence":string}],"summary":string}. ' +
    'Keep one result per rule, in the same order. summary is two plain sentences.';

  const prompt =
    `${describePlan(plan)}\n\nTheir rules:\n` +
    rules.map((rule, index) => `${index + 1}. ${rule}`).join('\n') +
    (flags.length ? `\n\nWarnings already found by arithmetic:\n- ${flags.join('\n- ')}` : '');

  const parsed = parseJson<{ results?: RuleResult[]; summary?: string }>(
    await askModel(system, prompt),
  );

  // Line the answers up with the rules, so a missing or reordered item cannot
  // quietly turn into a pass.
  const results: RuleResult[] = rules.map((rule, index) => {
    const found =
      parsed.results?.find((r) => r.rule?.trim() === rule.trim()) ?? parsed.results?.[index];
    return {
      rule,
      met: found?.met === true,
      evidence: String(found?.evidence ?? 'Not mentioned'),
    };
  });

  return {
    grade: capGrade(gradeFromResults(results), flags),
    results,
    summary: parsed.summary?.trim() || '',
  };
}

/* ------------------------------------------------------------------ */
/* During and after the trade                                          */
/* ------------------------------------------------------------------ */

function entryAsPlan(entry: JournalEntry): PlanInput {
  return {
    pair: entry.pair,
    direction: entry.direction,
    planned_entry: entry.planned_entry,
    stop_loss: entry.stop_loss,
    take_profit: entry.take_profit,
    size: entry.size,
    reasons: entry.reasons,
    feelings_before: entry.feelings_before,
  };
}

/** Mid-trade: reflects the written plan back. Never says hold, close or move. */
export async function coachCheckin(entry: JournalEntry, text: string): Promise<string> {
  const system =
    "You are the trader's journal coach. You can see the plan they wrote BEFORE the trade. " +
    'Never tell them to enter, hold, close, add, or move a stop, and never predict price. Do this: ' +
    '(1) restate their planned stop, target and main reasons in one or two lines; ' +
    '(2) say whether what they describe now sounds like the invalidation they planned or like a ' +
    'feeling such as fear or doubt; (3) ask one short question. Under 90 words, plain language.';

  const earlier = entry.checkins.length
    ? '\n\nEarlier check-ins:\n' + entry.checkins.map((c) => `- ${c.text}`).join('\n')
    : '';

  return askModel(
    system,
    `The plan:\n${describePlan(entryAsPlan(entry))}\nGrade at the time: ${entry.grade ?? 'none'}` +
      `${earlier}\n\nRight now they say: ${text}`,
    1500,
  );
}

/** After the trade: plan versus what happened, using only what they wrote. */
export async function reviewTrade(
  entry: JournalEntry,
  resultPl: number | null,
  feelingsAfter: string,
): Promise<string> {
  const system =
    'You review a finished trade for the trader. Compare the written plan with what they say ' +
    'happened. Say what followed the plan and what did not (for example exiting early, moving a ' +
    'stop, a different lot size), using only what they wrote. Name one thing worth watching if it ' +
    'repeats across trades, as a possibility, not a fact. No trading signals. Under 120 words.';

  const checkins = entry.checkins.length
    ? '\n\nCheck-ins during the trade:\n' + entry.checkins.map((c) => `- ${c.text}`).join('\n')
    : '';

  return askModel(
    system,
    `The plan:\n${describePlan(entryAsPlan(entry))}${checkins}\n\n` +
      `Result: ${resultPl === null ? 'not given' : resultPl}\nWhat they say about it: ${feelingsAfter || '(nothing)'}`,
    1500,
  );
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

const num = (value: unknown): number | null =>
  value === null || value === undefined || value === '' ? null : Number(value);

function normalize(row: Record<string, unknown>): JournalEntry {
  return {
    id: Number(row.id),
    created_at: String(row.created_at),
    status: row.status as EntryStatus,
    pair: String(row.pair),
    direction: row.direction as Direction,
    planned_entry: num(row.planned_entry),
    stop_loss: num(row.stop_loss),
    take_profit: num(row.take_profit),
    size: num(row.size),
    reasons: String(row.reasons ?? ''),
    feelings_before: String(row.feelings_before ?? ''),
    grade: (row.grade as string | null) ?? null,
    rules_result: (row.rules_result as RuleResult[]) ?? [],
    flags: (row.flags as string[]) ?? [],
    ai_summary: (row.ai_summary as string | null) ?? null,
    checkins: (row.checkins as Checkin[]) ?? [],
    result_pl: num(row.result_pl),
    feelings_after: (row.feelings_after as string | null) ?? null,
    review: (row.review as string | null) ?? null,
    closed_at: (row.closed_at as string | null) ?? null,
  };
}

export async function insertEntry(
  plan: PlanInput,
  graded: { grade: string; results: RuleResult[]; flags: string[]; summary: string },
): Promise<JournalEntry> {
  const { data, error } = await supabase
    .from('journal_entries')
    .insert([
      {
        ...plan,
        log_method: 'plan',
        pair: plan.pair.trim().toUpperCase(),
        grade: graded.grade,
        rules_result: graded.results,
        flags: graded.flags,
        ai_summary: graded.summary,
      },
    ])
    .select()
    .single();
  if (error) {
    throw error;
  }
  return normalize(data as Record<string, unknown>);
}

export async function updateEntry(
  id: number,
  patch: Record<string, unknown>,
): Promise<JournalEntry> {
  const { data, error } = await supabase
    .from('journal_entries')
    .update(patch)
    .eq('id', id)
    .neq('status', 'closed') // a closed trade can never be edited
    .select()
    .single();
  if (error) {
    throw error;
  }
  return normalize(data as Record<string, unknown>);
}

/** Plans and open trades, newest first. */
export async function listOpenEntries(): Promise<JournalEntry[]> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    throw error;
  }
  return (data as Record<string, unknown>[]).map(normalize);
}

/* ------------------------------------------------------------------ */
/* Screenshot -> trade numbers                                         */
/* ------------------------------------------------------------------ */

export type ExtractedTrade = {
  pair: string | null;
  direction: Direction | null;
  entry_price: number | null;
  exit_price: number | null;
  size: number | null;
  profit_loss: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  notes: string | null;
};

/**
 * Sends a screenshot to the proxy and returns the numbers the AI could read.
 * Never saved from here: the screen shows them for you to check first.
 */
export async function extractTradeFromImage(uri: string, mimeHint?: string): Promise<ExtractedTrade> {
  // Read the picked file into raw bytes.
  const blob = await (await fetch(uri)).blob();
  const mime =
    mimeHint && mimeHint.startsWith('image/')
      ? mimeHint
      : blob.type.startsWith('image/')
        ? blob.type
        : 'image/jpeg';
  if (blob.size === 0) {
    throw new Error('That image was empty. Pick it again.');
  }

  // STEP 1-4: endpoint, method, headers (the image type), body (the bytes)
  const response = await fetch(proxyBase() + '/v1/extract-trade', {
    method: 'POST',
    headers: { 'content-type': mime },
    body: blob,
  });

  // STEP 5: 400 = unsupported image, 413 = too large, 404 = old proxy, 429 = free limit.
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(errorMessage(raw) ?? `Screenshot error ${response.status}`);
  }
  const { text } = JSON.parse(raw) as { text?: string };
  const parsed = parseJson<Partial<ExtractedTrade>>(text ?? '');

  const direction =
    parsed.direction === 'buy' || parsed.direction === 'sell' ? parsed.direction : null;
  return {
    pair: parsed.pair ? String(parsed.pair).toUpperCase() : null,
    direction,
    entry_price: num(parsed.entry_price),
    exit_price: num(parsed.exit_price),
    size: num(parsed.size),
    profit_loss: num(parsed.profit_loss),
    stop_loss: num(parsed.stop_loss),
    take_profit: num(parsed.take_profit),
    notes: parsed.notes ? String(parsed.notes) : null,
  };
}
