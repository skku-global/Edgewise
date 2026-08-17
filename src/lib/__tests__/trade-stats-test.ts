/**
 * Tests for the Reports metrics.
 *
 * Three of these pin conventions that a plausible-looking rewrite would break,
 * and the module's own header calls them out: scratches stay in the win-rate
 * denominator so Reports and Dashboard cannot print two different win rates for
 * the same history; profit factor is null rather than infinite with no losses;
 * and drawdown is measured from a starting balance of zero so a losing first
 * trade counts.
 */

import {
  EMPTY_STATS,
  breakdownBy,
  breakdownByWeekday,
  buildDailySeries,
  computeStats,
  type StatsTrade,
} from '../trade-stats';

let seq = 0;

function t(pl: number, extra: Partial<StatsTrade> = {}): StatsTrade {
  seq += 1;
  return {
    id: seq,
    pair: 'EURUSD',
    direction: 'buy',
    setup_type: null,
    // Sequential days, so array order is also chronological order unless a test
    // deliberately overrides it.
    created_at: new Date(2026, 0, seq, 12).toISOString(),
    pl,
    moods: [],
    ...extra,
  };
}

beforeEach(() => {
  seq = 0;
});

describe('computeStats', () => {
  it('returns the empty stats for no trades', () => {
    expect(computeStats([])).toEqual(EMPTY_STATS);
  });

  it('counts wins, losses and scratches separately', () => {
    const stats = computeStats([t(10), t(-4), t(0), t(6)]);
    expect(stats.trades).toBe(4);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.scratches).toBe(1);
  });

  it('keeps scratches in the win-rate denominator', () => {
    // 1 win out of 2 trades, not 1 out of 1.
    expect(computeStats([t(10), t(0)]).winRate).toBe(50);
  });

  it('reports gross profit and gross loss as magnitudes', () => {
    const stats = computeStats([t(10), t(5), t(-3), t(-2)]);
    expect(stats.grossProfit).toBe(15);
    expect(stats.grossLoss).toBe(5);
    expect(stats.netPl).toBe(10);
  });

  it('returns a null profit factor when there are no losses', () => {
    const stats = computeStats([t(10), t(5), t(0)]);
    expect(stats.profitFactor).toBeNull();
    expect(stats.winLossRatio).toBeNull();
  });

  it('divides gross profit by gross loss when both exist', () => {
    const stats = computeStats([t(30), t(-10)]);
    expect(stats.profitFactor).toBe(3);
    expect(stats.winLossRatio).toBe(3);
  });

  it('averages each side over its own count, not over all trades', () => {
    const stats = computeStats([t(10), t(20), t(-5)]);
    expect(stats.averageWin).toBe(15);
    expect(stats.averageLoss).toBe(5);
  });

  it('reports expectancy as net P/L per trade', () => {
    const trades = [t(10), t(-4), t(0), t(6)];
    const stats = computeStats(trades);
    expect(stats.expectancy).toBe(stats.netPl / trades.length);
    expect(stats.expectancy).toBe(3);
  });

  it('reports the largest win and loss as magnitudes', () => {
    const stats = computeStats([t(7), t(21), t(-40), t(-2)]);
    expect(stats.largestWin).toBe(21);
    expect(stats.largestLoss).toBe(40);
  });

  it('measures drawdown from a zero starting balance', () => {
    // A losing first trade is a drawdown, even though equity never had a peak.
    expect(computeStats([t(-25)]).maxDrawdown).toBe(25);
  });

  it('measures drawdown peak-to-trough, not first-to-last', () => {
    // Equity: 100, 60, 160, 110. Deepest fall is 100 -> 60.
    const stats = computeStats([t(100), t(-40), t(100), t(-50)]);
    expect(stats.maxDrawdown).toBe(50);
    expect(stats.netPl).toBe(110);
  });

  it('reports no drawdown for a run that only goes up', () => {
    expect(computeStats([t(10), t(10)]).maxDrawdown).toBe(0);
  });

  it('tracks the longest run on each side', () => {
    const stats = computeStats([t(1), t(2), t(3), t(-1), t(-2), t(5)]);
    expect(stats.longestWinStreak).toBe(3);
    expect(stats.longestLossStreak).toBe(2);
  });

  it('lets a scratch break a run rather than extending it', () => {
    // Three wins either side of a break-even trade are not a streak of six.
    const stats = computeStats([t(1), t(1), t(1), t(0), t(1), t(1), t(1)]);
    expect(stats.longestWinStreak).toBe(3);
  });

  it('reports the run in progress at the newest trade', () => {
    expect(computeStats([t(5), t(-1), t(-2)]).currentStreak).toEqual({ kind: 'loss', length: 2 });
    expect(computeStats([t(-5), t(1)]).currentStreak).toEqual({ kind: 'win', length: 1 });
  });

  it('reports no current streak when the newest trade is a scratch', () => {
    expect(computeStats([t(5), t(0)]).currentStreak).toEqual({ kind: 'none', length: 0 });
  });

  it('orders trades itself, so the caller’s order cannot change the answer', () => {
    const chronological = [t(100), t(-40), t(100), t(-50)];
    const shuffled = [chronological[2], chronological[0], chronological[3], chronological[1]];
    expect(computeStats(shuffled)).toEqual(computeStats(chronological));
  });

  it('does not mutate the input', () => {
    const trades = [t(5), t(-5)];
    const before = [...trades];
    computeStats(trades);
    expect(trades).toEqual(before);
  });
});

describe('breakdownBy', () => {
  it('totals each group and ranks by net P/L', () => {
    const rows = breakdownBy(
      [
        t(10, { pair: 'EURUSD' }),
        t(-4, { pair: 'GBPUSD' }),
        t(6, { pair: 'EURUSD' }),
      ],
      (trade) => [trade.pair],
    );

    expect(rows).toEqual([
      { label: 'EURUSD', trades: 2, wins: 2, netPl: 16, winRate: 100 },
      { label: 'GBPUSD', trades: 1, wins: 0, netPl: -4, winRate: 0 },
    ]);
  });

  it('puts a trade in every group its key function returns', () => {
    const rows = breakdownBy([t(10, { moods: ['calm', 'confident'] })], (trade) => trade.moods);
    expect(rows.map((r) => r.label).sort()).toEqual(['calm', 'confident']);
    // Group counts deliberately sum to more than the trade count here.
    expect(rows.reduce((sum, r) => sum + r.trades, 0)).toBe(2);
  });

  it('drops a trade whose key function returns nothing', () => {
    // An untagged trade is absent data. A "None" row would put it in
    // competition with real setups in the rankings.
    expect(breakdownBy([t(10), t(-4)], () => [])).toEqual([]);
  });

  it('counts a scratch as a trade but not a win', () => {
    const [row] = breakdownBy([t(0, { pair: 'EURUSD' })], (trade) => [trade.pair]);
    expect(row).toEqual({ label: 'EURUSD', trades: 1, wins: 0, netPl: 0, winRate: 0 });
  });
});

describe('breakdownByWeekday', () => {
  it('orders Monday to Sunday rather than by P/L', () => {
    // 2026-01-05 is a Monday.
    const monday = { created_at: new Date(2026, 0, 5, 12).toISOString() };
    const wednesday = { created_at: new Date(2026, 0, 7, 12).toISOString() };
    const sunday = { created_at: new Date(2026, 0, 11, 12).toISOString() };

    const rows = breakdownByWeekday([t(1, sunday), t(500, wednesday), t(2, monday)]);
    expect(rows.map((r) => r.label)).toEqual(['Monday', 'Wednesday', 'Sunday']);
  });

  it('omits days with no trades', () => {
    const monday = { created_at: new Date(2026, 0, 5, 12).toISOString() };
    expect(breakdownByWeekday([t(1, monday)]).map((r) => r.label)).toEqual(['Monday']);
  });

  it('returns nothing for no trades', () => {
    expect(breakdownByWeekday([])).toEqual([]);
  });
});

describe('buildDailySeries', () => {
  const on = (day: number, hour = 12) => ({
    created_at: new Date(2026, 0, day, hour).toISOString(),
  });

  it('sums the trades on each day', () => {
    const series = buildDailySeries([t(10, on(5, 9)), t(-4, on(5, 15))]);
    expect(series).toHaveLength(1);
    expect(series[0].pl).toBe(6);
    expect(series[0].trades).toBe(2);
    expect(series[0].key).toBe('2026-01-05');
  });

  it('orders oldest first', () => {
    const series = buildDailySeries([t(1, on(9)), t(1, on(5)), t(1, on(7))]);
    expect(series.map((d) => d.key)).toEqual(['2026-01-05', '2026-01-07', '2026-01-09']);
  });

  it('skips days with no trades instead of emitting zero bars', () => {
    // A Monday-to-Friday trader would otherwise get two dead columns a week.
    const series = buildDailySeries([t(1, on(5)), t(1, on(12))]);
    expect(series).toHaveLength(2);
  });

  it('anchors each entry at local midnight', () => {
    const [day] = buildDailySeries([t(1, on(5, 23))]);
    expect(day.date.getHours()).toBe(0);
    expect(day.date.getDate()).toBe(5);
  });

  it('returns nothing for no trades', () => {
    expect(buildDailySeries([])).toEqual([]);
  });
});
