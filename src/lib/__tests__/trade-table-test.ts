/**
 * Tests for the trades table's sort and filter.
 *
 * Two behaviours here are easy to break and hard to notice. The first is the
 * tie-break: tapping the P/L header must not reshuffle same-P/L rows into a
 * random date order, or the table looks like it lost data. The second is that
 * filtering by a canonical setup has to match the legacy spellings underneath
 * it, otherwise "Breakout" hides the very rows it should be selecting.
 */

import { makeTrade } from '../__fixtures__/trade';
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  applyFilters,
  applySort,
  nextSortState,
} from '../trade-table';

describe('applyFilters', () => {
  const rows = [
    makeTrade({ id: 1, direction: 'buy', setup_type: 'Breakout' }),
    makeTrade({ id: 2, direction: 'sell', setup_type: 'bo' }),
    makeTrade({ id: 3, direction: 'buy', setup_type: 'liquidity sweep' }),
    makeTrade({ id: 4, direction: 'sell', setup_type: null }),
  ];

  it('passes everything through by default', () => {
    expect(applyFilters(rows, DEFAULT_FILTERS)).toHaveLength(4);
  });

  it('filters by direction', () => {
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, direction: 'buy' }).map((r) => r.id)).toEqual([
      1, 3,
    ]);
  });

  it('matches legacy spellings when filtering by a canonical setup', () => {
    const matched = applyFilters(rows, { ...DEFAULT_FILTERS, setup: 'Breakout' });
    expect(matched.map((r) => r.id)).toEqual([1, 2]);
  });

  it('matches an unmappable setup against its own raw label', () => {
    const matched = applyFilters(rows, { ...DEFAULT_FILTERS, setup: 'liquidity sweep' });
    expect(matched.map((r) => r.id)).toEqual([3]);
  });

  it('excludes rows with no setup from any setup filter', () => {
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, setup: 'Breakout' })).not.toContain(rows[3]);
  });

  it('combines the two filters', () => {
    const matched = applyFilters(rows, { direction: 'sell', setup: 'Breakout' });
    expect(matched.map((r) => r.id)).toEqual([2]);
  });
});

describe('applySort', () => {
  const older = '2026-08-01T00:00:00.000Z';
  const newer = '2026-08-14T00:00:00.000Z';

  it('defaults to newest first', () => {
    const rows = [
      makeTrade({ id: 1, created_at: older }),
      makeTrade({ id: 2, created_at: newer }),
    ];
    expect(applySort(rows, DEFAULT_SORT).map((r) => r.id)).toEqual([2, 1]);
  });

  it('sorts by date ascending when asked', () => {
    const rows = [
      makeTrade({ id: 1, created_at: newer }),
      makeTrade({ id: 2, created_at: older }),
    ];
    expect(applySort(rows, { key: 'date', ascending: true }).map((r) => r.id)).toEqual([2, 1]);
  });

  it('breaks a date tie with the bigger win first, in both directions', () => {
    const rows = [
      makeTrade({ id: 1, created_at: older, pl: -5 }),
      makeTrade({ id: 2, created_at: older, pl: 20 }),
    ];
    expect(applySort(rows, { key: 'date', ascending: false }).map((r) => r.id)).toEqual([2, 1]);
    expect(applySort(rows, { key: 'date', ascending: true }).map((r) => r.id)).toEqual([2, 1]);
  });

  it('sorts by P/L, biggest win first', () => {
    const rows = [
      makeTrade({ id: 1, pl: -10 }),
      makeTrade({ id: 2, pl: 30 }),
      makeTrade({ id: 3, pl: 5 }),
    ];
    expect(applySort(rows, { key: 'pl', ascending: false }).map((r) => r.id)).toEqual([2, 3, 1]);
    expect(applySort(rows, { key: 'pl', ascending: true }).map((r) => r.id)).toEqual([1, 3, 2]);
  });

  it('breaks a P/L tie with the newest trade first, in both directions', () => {
    const rows = [
      makeTrade({ id: 1, pl: 10, created_at: older }),
      makeTrade({ id: 2, pl: 10, created_at: newer }),
    ];
    expect(applySort(rows, { key: 'pl', ascending: false }).map((r) => r.id)).toEqual([2, 1]);
    expect(applySort(rows, { key: 'pl', ascending: true }).map((r) => r.id)).toEqual([2, 1]);
  });

  it('does not mutate the input', () => {
    const rows = [
      makeTrade({ id: 1, created_at: older }),
      makeTrade({ id: 2, created_at: newer }),
    ];
    applySort(rows, DEFAULT_SORT);
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });
});

describe('nextSortState', () => {
  it('starts a new column descending', () => {
    expect(nextSortState({ key: 'date', ascending: true }, 'pl')).toEqual({
      key: 'pl',
      ascending: false,
    });
  });

  it('flips the direction of the current column', () => {
    expect(nextSortState({ key: 'pl', ascending: false }, 'pl')).toEqual({
      key: 'pl',
      ascending: true,
    });
    expect(nextSortState({ key: 'pl', ascending: true }, 'pl')).toEqual({
      key: 'pl',
      ascending: false,
    });
  });
});
