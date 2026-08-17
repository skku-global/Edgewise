/**
 * Tests for the date-range presets.
 *
 * The property worth protecting is that a range is counted in whole local days,
 * not as a rolling 24-hour window. With a rolling window, a trader who looks at
 * "Last 7 days" twice an hour apart sees the totals move for no reason they
 * caused, and this morning's trade silently drops out of the count at lunchtime
 * tomorrow while the label still says seven days.
 *
 * Dates are built from local parts throughout, so the assertions do not depend
 * on the machine's timezone.
 */

import {
  DEFAULT_RANGE,
  RANGE_OPTIONS,
  asRangeKey,
  rangeLabel,
  rangeStart,
  withinRange,
} from '../date-range';

// A Wednesday, mid-month, mid-afternoon — far enough from any boundary that a
// failure means the arithmetic is wrong rather than the fixture unlucky.
const NOW = new Date(2026, 7, 12, 15, 30);
const midnight = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

describe('rangeStart', () => {
  it('has no lower bound for all time', () => {
    expect(rangeStart('all', NOW)).toBeNull();
  });

  it('starts "this month" at midnight on the 1st', () => {
    expect(rangeStart('month', NOW)).toBe(midnight(2026, 7, 1));
  });

  it('counts whole days, including today', () => {
    // Aug 12 plus the six days before it -> starts Aug 6, not Aug 5.
    expect(rangeStart('7d', NOW)).toBe(midnight(2026, 7, 6));
  });

  it('starts at midnight rather than the current time of day', () => {
    const start = new Date(rangeStart('7d', NOW)!);
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
  });

  it('rolls back across a month boundary', () => {
    // 30 days back from 12 August lands in July.
    expect(rangeStart('30d', NOW)).toBe(midnight(2026, 6, 14));
  });

  it('rolls back across a year boundary', () => {
    const january = new Date(2026, 0, 3, 9, 0);
    expect(rangeStart('7d', january)).toBe(midnight(2025, 11, 28));
  });

  it('handles 90 days', () => {
    expect(rangeStart('90d', NOW)).toBe(midnight(2026, 4, 15));
  });

  it('does not move as the clock advances within the same day', () => {
    const morning = new Date(2026, 7, 12, 6, 0);
    const evening = new Date(2026, 7, 12, 23, 59);
    expect(rangeStart('7d', morning)).toBe(rangeStart('7d', evening));
  });
});

describe('withinRange', () => {
  const row = (y: number, m: number, d: number, h = 12) => ({
    created_at: new Date(y, m, d, h).toISOString(),
  });

  it('returns every row for all time, untouched', () => {
    const rows = [row(2020, 0, 1), row(2026, 7, 12)];
    expect(withinRange(rows, 'all', NOW)).toBe(rows);
  });

  it('includes a trade from earlier today', () => {
    expect(withinRange([row(2026, 7, 12, 1)], '7d', NOW)).toHaveLength(1);
  });

  it('includes the first instant of the earliest day in range', () => {
    expect(withinRange([row(2026, 7, 6, 0)], '7d', NOW)).toHaveLength(1);
  });

  it('excludes the day before the range starts', () => {
    expect(withinRange([row(2026, 7, 5, 23)], '7d', NOW)).toHaveLength(0);
  });

  it('preserves order', () => {
    const rows = [row(2026, 7, 11), row(2026, 7, 7), row(2026, 7, 12)];
    expect(withinRange(rows, '7d', NOW)).toEqual(rows);
  });
});

describe('asRangeKey', () => {
  it('passes the known keys through', () => {
    for (const key of ['7d', '30d', '90d', 'month'] as const) {
      expect(asRangeKey(key)).toBe(key);
    }
  });

  it('falls back to all time for anything else', () => {
    expect(asRangeKey(null)).toBe('all');
    expect(asRangeKey('all')).toBe('all');
    expect(asRangeKey('last tuesday')).toBe('all');
  });
});

describe('labels', () => {
  it('has a short label for every key the dropdown offers', () => {
    for (const option of RANGE_OPTIONS) {
      expect(rangeLabel(asRangeKey(option.value))).toMatch(/\S/);
    }
  });

  it('defaults to all time', () => {
    expect(DEFAULT_RANGE).toBe('all');
    expect(rangeLabel(DEFAULT_RANGE)).toBe('all time');
  });

  it('offers exactly the keys asRangeKey understands', () => {
    // A dropdown entry that narrowed to 'all' would silently do nothing.
    const offered = RANGE_OPTIONS.map((option) => option.value);
    expect(offered).toEqual(['all', '7d', '30d', '90d', 'month']);
  });
});
