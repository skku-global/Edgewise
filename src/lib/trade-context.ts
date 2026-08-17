/**
 * Reads the trade + mood tables for the Chat tab.
 *
 * This module is the I/O half; the row mapping and rendering live in
 * `trade-briefing.ts` so they stay testable without a network round trip. Both
 * are re-exported here, so callers only need one import.
 */

import { supabase } from "./supabase";
import { toContextTrade, type ContextTrade, type TradeContextRow } from "./trade-briefing";
import { BASE_TRADE_COLUMNS } from "./trade-table";

export { buildTradingContext } from "./trade-briefing";
export type { ContextTrade } from "./trade-briefing";

type MoodRow = {
  trade_id: number;
  mood_tag: string | null;
};

/** Reads every trade plus its moods. Throws if either query fails. */
export async function fetchTradingContext(): Promise<ContextTrade[]> {
  const { data: tradeData, error: tradeError } = await supabase
    .from("trades")
    .select(BASE_TRADE_COLUMNS)
    .order("created_at", { ascending: false });

  if (tradeError) {
    throw tradeError;
  }

  const rows = (tradeData as TradeContextRow[]) ?? [];
  if (rows.length === 0) {
    return [];
  }

  const { data: moodData, error: moodError } = await supabase
    .from("moods")
    .select("trade_id, mood_tag")
    .in(
      "trade_id",
      rows.map((row) => row.id),
    );

  if (moodError) {
    throw moodError;
  }

  const moodsByTrade = ((moodData as MoodRow[]) ?? []).reduce((acc, mood) => {
    if (!mood.mood_tag) {
      return acc;
    }
    const existing = acc.get(mood.trade_id) ?? [];
    existing.push(mood.mood_tag);
    acc.set(mood.trade_id, existing);
    return acc;
  }, new Map<number, string[]>());

  return rows.map((row) => toContextTrade(row, moodsByTrade.get(row.id) ?? []));
}
