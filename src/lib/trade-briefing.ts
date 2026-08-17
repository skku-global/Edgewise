/**
 * Renders the trade + mood briefing that the Chat tab sends to Claude.
 *
 * The chat screen re-sends this on every question, so it has to be small enough
 * to be cheap and complete enough that answers cite real rows instead of
 * inventing plausible ones. Two things earn their place:
 *   - Pre-computed per-setup and per-mood breakdowns. "Why do I keep losing on
 *     breakout trades" is answerable from a grouped table but needs arithmetic
 *     across the whole log otherwise, and models are worse at that than at
 *     reading a number someone already added up.
 *   - The raw trade lines, so follow-up questions about a specific trade have
 *     something to land on.
 *
 * Deliberately free of any Supabase import: this half is pure, so it can be
 * exercised against fixtures without a network round trip. The fetching half
 * lives in `trade-context.ts`.
 */

import { analyzeMoodPatterns } from "./trade-insights";
import { effectiveProfitLoss, hasStoredProfitLoss } from "./trade-math";

/**
 * Cap on individually-listed trades. Aggregates are always computed over the
 * full history; only the verbatim log is truncated, and the briefing says so
 * when it happens rather than silently showing a partial picture.
 */
const MAX_LISTED_TRADES = 200;

export type ContextTrade = {
  id: number;
  pair: string;
  direction: "buy" | "sell";
  entryPrice: number;
  exitPrice: number;
  size: number;
  setup: string;
  notes: string | null;
  createdAt: string;
  pl: number;
  /** True when pl was calculated here rather than read from profit_loss. */
  derived: boolean;
  moods: string[];
};

/** One row as `trades` returns it. */
export type TradeContextRow = {
  id: number;
  pair: string;
  direction: "buy" | "sell";
  entry_price: number;
  exit_price: number;
  size: number;
  setup_type: string | null;
  notes: string | null;
  profit_loss: number | null;
  created_at: string;
};

/** Shapes one PostgREST row into the briefing's trade type. */
export function toContextTrade(
  row: TradeContextRow,
  moods: string[],
): ContextTrade {
  // PostgREST can hand numerics back as strings, and the trading screens coerce
  // defensively for that reason — a string here would make pl a concatenation.
  const numeric = {
    direction: row.direction,
    entry_price: Number(row.entry_price),
    exit_price: Number(row.exit_price),
    size: Number(row.size),
    profit_loss: row.profit_loss === null ? null : Number(row.profit_loss),
  };

  return {
    id: row.id,
    pair: row.pair,
    direction: row.direction,
    entryPrice: numeric.entry_price,
    exitPrice: numeric.exit_price,
    size: numeric.size,
    setup: (row.setup_type ?? "").trim() || "(none recorded)",
    notes: row.notes,
    createdAt: row.created_at,
    pl: effectiveProfitLoss(numeric),
    derived: !hasStoredProfitLoss(numeric),
    moods,
  };
}

function formatSigned(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(2)}`;
}

function isoDay(timestamp: string) {
  return timestamp.slice(0, 10);
}

type Bucket = { key: string; trades: ContextTrade[] };

/** Groups trades by a caller-chosen label, keeping first-seen order stable. */
function bucketBy(
  trades: ContextTrade[],
  keyOf: (trade: ContextTrade) => string[],
): Bucket[] {
  const buckets = new Map<string, ContextTrade[]>();
  for (const trade of trades) {
    for (const key of keyOf(trade)) {
      const existing = buckets.get(key);
      if (existing) {
        existing.push(trade);
      } else {
        buckets.set(key, [trade]);
      }
    }
  }
  return [...buckets].map(([key, group]) => ({ key, trades: group }));
}

function describeBucket({ key, trades }: Bucket) {
  const wins = trades.filter((trade) => trade.pl > 0).length;
  const net = trades.reduce((sum, trade) => sum + trade.pl, 0);
  const rate = ((wins / trades.length) * 100).toFixed(0);
  const avg = net / trades.length;
  return `- ${key}: ${trades.length} ${trades.length === 1 ? "trade" : "trades"}, ${wins} won (${rate}%), net ${formatSigned(net)}, avg ${formatSigned(avg)}`;
}

export function buildTradingContext(trades: ContextTrade[]): string {
  if (trades.length === 0) {
    return [
      "=== TRADING JOURNAL ===",
      "The user has not logged any trades yet. You have no data to analyse.",
      "Say so plainly and suggest they log a few trades on the Trades tab first.",
    ].join("\n");
  }

  const wins = trades.filter((trade) => trade.pl > 0).length;
  const net = trades.reduce((sum, trade) => sum + trade.pl, 0);
  const derived = trades.filter((trade) => trade.derived).length;
  const days = trades.map((trade) => isoDay(trade.createdAt)).sort();
  const sortedByPl = [...trades].sort((a, b) => b.pl - a.pl);
  const best = sortedByPl[0];
  const worst = sortedByPl[sortedByPl.length - 1];
  const insight = analyzeMoodPatterns(trades);

  const lines: string[] = [
    "=== TRADING JOURNAL BRIEFING ===",
    `Every figure below comes from the user's own logged trades. ${trades.length} ${
      trades.length === 1 ? "trade" : "trades"
    }, ${days[0]} to ${days[days.length - 1]}.`,
    "",
    "OVERALL",
    `- Trades: ${trades.length}`,
    `- Won: ${wins} (${((wins / trades.length) * 100).toFixed(0)}% win rate). A trade counts as won when P/L is above zero; exactly zero is not a win.`,
    `- Net P/L: ${formatSigned(net)}`,
    `- Best: ${formatSigned(best.pl)} on #${best.id} ${best.pair}. Worst: ${formatSigned(worst.pl)} on #${worst.id} ${worst.pair}.`,
  ];

  if (derived > 0) {
    lines.push(
      `- CAVEAT: ${derived} of ${trades.length} trades have no stored profit_loss, so their P/L was calculated as (exit - entry) x size, direction-adjusted. That is a gross price move: it ignores spread, commission and swap. Mention this if the user asks about exact money.`,
    );
  }

  lines.push(
    "",
    'BY SETUP (setup_type is free text the user typed themselves, so near-duplicate labels such as "breakout" and "breakoutr" are very likely the same setup, and a vague label like "yes" means they did not really categorise it)',
    ...bucketBy(trades, (trade) => [`"${trade.setup}"`]).map(describeBucket),
    "",
    "BY DIRECTION",
    ...bucketBy(trades, (trade) => [trade.direction.toUpperCase()]).map(
      describeBucket,
    ),
    "",
    "BY MOOD (a trade appears under each mood tagged on it; untagged trades are grouped separately)",
    ...bucketBy(trades, (trade) =>
      trade.moods.length > 0 ? trade.moods : ["(no mood logged)"],
    ).map(describeBucket),
    "",
    "MOOD PATTERN (the same analysis shown on the Dashboard)",
    insight.summary,
  );

  const listed = trades.slice(0, MAX_LISTED_TRADES);
  lines.push(
    "",
    `TRADE LOG (newest first${
      listed.length < trades.length
        ? `, showing the ${listed.length} most recent of ${trades.length}; the aggregates above cover all of them`
        : ""
    })`,
    ...listed.map((trade) => {
      const parts = [
        `#${trade.id}`,
        isoDay(trade.createdAt),
        trade.pair.toUpperCase(),
        trade.direction.toUpperCase(),
        `entry ${trade.entryPrice}`,
        `exit ${trade.exitPrice}`,
        `size ${trade.size}`,
        `=> ${formatSigned(trade.pl)}${trade.derived ? " (calculated)" : ""}`,
        `setup: "${trade.setup}"`,
        `mood: ${trade.moods.length > 0 ? trade.moods.join(", ") : "none"}`,
      ];
      if (trade.notes) {
        parts.push(`notes: ${trade.notes}`);
      }
      return parts.join(" | ");
    }),
  );

  return lines.join("\n");
}
