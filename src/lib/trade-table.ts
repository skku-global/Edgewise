/**
 * Pure sort and filter helpers for the trades table. Kept outside the screens
 * so the table's behaviour is testable without a network round trip.
 */

import { normalizeSetup } from './setup-types';

export type TradeRow = {
  id: number;
  pair: string;
  direction: 'buy' | 'sell';
  entry_price: number;
  exit_price: number;
  size: number;
  setup_type: string | null;
  notes: string | null;
  profit_loss: number | null;
  created_at: string;
  /** Where the row came from: 'manual' (Add Trade form) or 'mt5' (auto-sync). */
  source: 'manual' | 'mt5' | 'ctrader' | 'tradelocker' | string;
  /** Broker's own id for the trade (MT5 position id). Dedup anchor. */
  external_id: string | null;
  /** Broker account the trade was imported from. Null for manual rows. */
  account_login: string | null;
  /** Real open and close times for imported trades. Null for manual rows. */
  opened_at: string | null;
  closed_at: string | null;
  /** Effective P/L, stored or derived (see trade-math). */
  pl: number;
  moods: string[];
  motion_flag: string | null;
};

export type SortKey = 'date' | 'pl';

/**
 * Column lists for the two places that read `trades`.
 *
 * There are two readers on purpose, and they are not interchangeable:
 * `use-trades.ts` is a hook feeding render-time state, `trade-context.ts` is a
 * one-shot async fetch for the Chat briefing. What they must NOT do is drift in
 * which columns they name — and they already did. The broker-sync migration
 * added `source`/`external_id`/`opened_at`/`closed_at`, the hook was widened to
 * select them, the Chat loader was not, and on a database where the migration
 * had not run the app showed 0 trades on three screens and 6 on Chat at the
 * same moment. Same table, same instant, two answers.
 *
 * So the shared base lives here once, and each reader declares only its own
 * extras. Adding a column to the base now reaches both.
 */
export const BASE_TRADE_COLUMNS =
  'id, pair, direction, entry_price, exit_price, size, setup_type, notes, profit_loss, created_at';

/** Provenance and real broker timestamps — added by scripts/add-broker-sync.sql. */
export const SYNC_TRADE_COLUMNS = 'source, external_id, account_login, opened_at, closed_at';

/** Everything a `TradeRow` needs. Requires the broker-sync migration. */
export const FULL_TRADE_COLUMNS = `${BASE_TRADE_COLUMNS}, ${SYNC_TRADE_COLUMNS}`;

export type SortState = {
  key: SortKey;
  ascending: boolean;
};

export type TableFilters = {
  direction: 'all' | 'buy' | 'sell';
  setup: string | null; // null = all setups
};

/** Default state: newest trade first. */
export const DEFAULT_SORT: SortState = { key: 'date', ascending: false };

export const DEFAULT_FILTERS: TableFilters = { direction: 'all', setup: null };

export function applyFilters(rows: TradeRow[], filters: TableFilters): TradeRow[] {
  return rows.filter((row) => {
    if (filters.direction !== 'all' && row.direction !== filters.direction) {
      return false;
    }
    if (filters.setup !== null) {
      const normalized = normalizeSetup(row.setup_type);
      // A legacy value that maps onto a canonical setup matches that setup;
      // an unmappable one matches only its own raw label, so it stays findable.
      if (normalized !== filters.setup && (row.setup_type ?? '') !== filters.setup) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Returns a copy of `rows` sorted by `sort`. `pl`-descending is the default
 * order for equal dates, and date-descending the default for equal P/L, so
 * tapping the other header swaps the primary key without reshuffling ties.
 */
export function applySort(rows: TradeRow[], sort: SortState): TradeRow[] {
  const factor = sort.ascending ? 1 : -1;

  return [...rows].sort((a, b) => {
    if (sort.key === 'date') {
      const byDate =
        Date.parse(a.created_at) - Date.parse(b.created_at);
      if (byDate !== 0) {
        return byDate * factor;
      }
      return b.pl - a.pl;
    }

    const byPl = a.pl - b.pl;
    if (byPl !== 0) {
      return byPl * factor;
    }
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}

/** Toggle the given key's direction; switching keys resets to descending. */
export function nextSortState(current: SortState, key: SortKey): SortState {
  if (current.key !== key) {
    return { key, ascending: false };
  }
  return { key, ascending: !current.ascending };
}
