/**
 * Date-range presets shared by the Reports screen and the trades table.
 *
 * Ranges are counted in whole local days, not rolling 24-hour windows: "Last 7
 * days" starts at midnight six days ago, so it covers today plus the six days
 * before it. A rolling window would drop this morning's trade from the "7 days"
 * count at lunchtime tomorrow while still calling it seven days, and a trader
 * comparing two screens an hour apart would see the totals move for no reason
 * they did anything to cause.
 *
 * `now` is a parameter rather than a `new Date()` inside each function so the
 * caller controls the boundary — one clock reading per render, and these stay
 * pure enough to test.
 */

export type RangeKey = 'all' | '7d' | '30d' | '90d' | 'month';

export const RANGE_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'All time', value: 'all' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
  { label: 'This month', value: 'month' },
];

export const DEFAULT_RANGE: RangeKey = 'all';

/** Short form for tight spaces like a stat card's caption. */
export function rangeLabel(key: RangeKey): string {
  switch (key) {
    case '7d':
      return 'last 7 days';
    case '30d':
      return 'last 30 days';
    case '90d':
      return 'last 90 days';
    case 'month':
      return 'this month';
    default:
      return 'all time';
  }
}

/**
 * Inclusive lower bound as a timestamp, or null for "all time" (no bound).
 */
export function rangeStart(key: RangeKey, now: Date): number | null {
  if (key === 'all') {
    return null;
  }

  if (key === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }

  const days = key === '7d' ? 7 : key === '30d' ? 30 : 90;
  // `days - 1` because the window includes today. Passing a day-of-month below
  // 1 is fine: the Date constructor rolls back into the previous month.
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (days - 1),
  ).getTime();
}

/** Keeps only the rows inside the range. Order is preserved. */
export function withinRange<T extends { created_at: string }>(
  rows: T[],
  key: RangeKey,
  now: Date,
): T[] {
  const start = rangeStart(key, now);
  if (start === null) {
    return rows;
  }
  return rows.filter((row) => Date.parse(row.created_at) >= start);
}

/** Narrows the dropdown's `string | null` back to a RangeKey. */
export function asRangeKey(value: string | null): RangeKey {
  switch (value) {
    case '7d':
    case '30d':
    case '90d':
    case 'month':
      return value;
    default:
      return 'all';
  }
}
