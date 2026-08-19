/**
 * Trade builder for the pure-library tests.
 *
 * `TradeRow` has twenty fields and a given test cares about two of them, so
 * spelling out the other eighteen in every case would bury the assertion in
 * scaffolding. Overrides are shallow-merged over a plausible winning manual
 * trade.
 *
 * This lives outside `__tests__` on purpose: Jest's default `testMatch` treats
 * *every* file under a `__tests__` folder as a suite, so a helper module placed
 * there fails the run with "your test suite must contain at least one test".
 */

import type { TradeRow } from '../trade-table';

let nextId = 1;

export function makeTrade(overrides: Partial<TradeRow> = {}): TradeRow {
  return {
    id: nextId++,
    pair: 'EURUSD',
    direction: 'buy',
    entry_price: 100,
    exit_price: 110,
    size: 1,
    setup_type: null,
    notes: null,
    profit_loss: null,
    created_at: '2026-08-10T12:00:00.000Z',
    source: 'manual',
    external_id: null,
    account_login: null,
    opened_at: null,
    closed_at: null,
    // Null rather than 0: a manual row has no broker costs at all, and 0 would
    // claim the broker reported "no commission" — which `tradeCosts` treats as
    // a real figure worth showing a breakdown for.
    commission: null,
    swap: null,
    pl: 0,
    moods: [],
    motion_flag: null,
    ...overrides,
  };
}

/** An imported trade — the shape the MetaTrader advisor produces. */
export function makeImported(overrides: Partial<TradeRow> = {}): TradeRow {
  return makeTrade({
    source: 'mt5',
    external_id: `${100000 + nextId}`,
    account_login: '5031234',
    opened_at: '2026-08-10T09:00:00.000Z',
    closed_at: '2026-08-10T12:00:00.000Z',
    ...overrides,
  });
}
