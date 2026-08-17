/**
 * The tagging queue: imported trades that still have no mood.
 *
 * This is the hinge the whole product turns on. Once trades arrive from the
 * broker automatically, the numbers are free -- and the only thing left worth
 * doing by hand is the psychology. A synced trade with no mood is an unanswered
 * question ("how were you feeling when you took this?"), and these helpers find
 * those questions so the dashboard can ask them.
 *
 * Manual trades are deliberately excluded. The Add Trade form captures mood at
 * save time, so a manual row without one means the user chose to skip it --
 * nagging about that would be pestering, not prompting.
 *
 * Pure functions, no network: the whole queue is derived from what useTrades
 * already loaded, so there is no second query and nothing to keep in sync.
 */

import type { TradeRow } from './trade-table';

/** True when the row came from a broker rather than the Add Trade form. */
export function isImported(trade: Pick<TradeRow, 'source'>): boolean {
  return trade.source !== 'manual';
}

/**
 * Imported trades with no mood recorded, newest first.
 *
 * Newest first because recall decays: yesterday's trade is still answerable,
 * last month's is guesswork. If the queue is long the user should be tagging
 * the trades they can still remember.
 */
export function untaggedTrades(trades: TradeRow[]): TradeRow[] {
  return trades
    .filter((trade) => isImported(trade) && trade.moods.length === 0)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/**
 * Imported trades with no setup classified.
 *
 * Tracked separately from mood because they serve different ends: mood feeds
 * the psychology insight, setup feeds the Pattern Engine's grouping. A trade
 * can legitimately have one and not the other.
 */
export function unclassifiedTrades(trades: TradeRow[]): TradeRow[] {
  return trades.filter((trade) => isImported(trade) && !trade.setup_type);
}

/** Sentence for the dashboard prompt, or null when there is nothing to ask. */
export function tagPromptLabel(trades: TradeRow[]): string | null {
  const count = untaggedTrades(trades).length;

  if (count === 0) {
    return null;
  }

  return count === 1
    ? '1 synced trade needs a mood'
    : `${count} synced trades need a mood`;
}
