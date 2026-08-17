/**
 * The performance metrics behind the Reports screen.
 *
 * Everything here is pure and derived from loaded trades — no queries, no
 * component imports — so the numbers can be reasoned about (and eventually
 * tested) without a network round trip or a render.
 *
 * Two conventions are worth stating up front, because both are places where a
 * plausible-looking alternative would quietly disagree with the rest of the app:
 *
 * 1. **Win rate counts every trade in the denominator**, including scratches
 *    (P/L exactly 0). That matches the dashboard's existing `wins /
 *    trades.length`, and having Reports and Dashboard print two different win
 *    rates for the same history would be worse than any argument for excluding
 *    scratches. `scratches` is reported separately so the gap is visible rather
 *    than silent.
 * 2. **Expectancy is not shown alongside an "average trade" figure**, because
 *    with these fields they are the same number. Expectancy expands to
 *    `(wins/n × grossProfit/wins) − (losses/n × grossLoss/losses)`, which is
 *    just `netPl / n`. TradeZella can show both only because it knows each
 *    trade's risk and can quote expectancy in R-multiples; this schema has no
 *    stop-loss column, so there is one honest number here, not two.
 */

export type StatsTrade = {
  id: number;
  pair: string;
  direction: 'buy' | 'sell';
  setup_type: string | null;
  created_at: string;
  pl: number;
  moods: string[];
};

export type StreakKind = 'win' | 'loss' | 'none';

export type CoreStats = {
  trades: number;
  wins: number;
  losses: number;
  /** Trades that closed at exactly break-even. Neither a win nor a loss. */
  scratches: number;
  /** Percentage, 0-100, over *all* trades — see the note at the top. */
  winRate: number;
  netPl: number;
  grossProfit: number;
  /** Positive magnitude of the losing side, so it reads as a size not a debt. */
  grossLoss: number;
  /**
   * Gross profit ÷ gross loss. **Null when there are no losses yet** — the
   * ratio is undefined there, and printing "∞" as a headline stat off a
   * three-trade winning streak would be the single most misleading number the
   * app could show.
   */
  profitFactor: number | null;
  averageWin: number;
  /** Positive magnitude. */
  averageLoss: number;
  /** Average win ÷ average loss. Null when there are no losses. */
  winLossRatio: number | null;
  /** Expected P/L per trade. Equals netPl / trades — see the note at the top. */
  expectancy: number;
  largestWin: number;
  /** Positive magnitude. */
  largestLoss: number;
  /**
   * Deepest peak-to-trough fall in cumulative P/L, as a positive number.
   * Measured from a starting balance of 0, so a losing first trade counts.
   */
  maxDrawdown: number;
  longestWinStreak: number;
  longestLossStreak: number;
  /** The run still in progress at the newest trade. */
  currentStreak: { kind: StreakKind; length: number };
};

/** Oldest first. Most metrics below are order-dependent and assume this. */
function chronological<T extends { created_at: string }>(trades: T[]): T[] {
  return [...trades].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
}

export const EMPTY_STATS: CoreStats = {
  trades: 0,
  wins: 0,
  losses: 0,
  scratches: 0,
  winRate: 0,
  netPl: 0,
  grossProfit: 0,
  grossLoss: 0,
  profitFactor: null,
  averageWin: 0,
  averageLoss: 0,
  winLossRatio: null,
  expectancy: 0,
  largestWin: 0,
  largestLoss: 0,
  maxDrawdown: 0,
  longestWinStreak: 0,
  longestLossStreak: 0,
  currentStreak: { kind: 'none', length: 0 },
};

export function computeStats(trades: StatsTrade[]): CoreStats {
  if (trades.length === 0) {
    return EMPTY_STATS;
  }

  const ordered = chronological(trades);

  let wins = 0;
  let losses = 0;
  let scratches = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let largestWin = 0;
  let largestLoss = 0;

  // Drawdown and streaks both need a single chronological pass, so they share
  // this loop rather than each re-sorting the list.
  let running = 0;
  let peak = 0;
  let maxDrawdown = 0;

  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let streakKind: StreakKind = 'none';
  let streakLength = 0;

  for (const trade of ordered) {
    const { pl } = trade;

    if (pl > 0) {
      wins += 1;
      grossProfit += pl;
      largestWin = Math.max(largestWin, pl);
    } else if (pl < 0) {
      losses += 1;
      grossLoss += Math.abs(pl);
      largestLoss = Math.max(largestLoss, Math.abs(pl));
    } else {
      scratches += 1;
    }

    running += pl;
    peak = Math.max(peak, running);
    maxDrawdown = Math.max(maxDrawdown, peak - running);

    // A scratch breaks the run: three wins either side of a break-even trade
    // are not a streak of six, and calling them one would overstate a record.
    const kind: StreakKind = pl > 0 ? 'win' : pl < 0 ? 'loss' : 'none';
    if (kind === streakKind && kind !== 'none') {
      streakLength += 1;
    } else {
      streakKind = kind;
      streakLength = kind === 'none' ? 0 : 1;
    }

    if (streakKind === 'win') {
      longestWinStreak = Math.max(longestWinStreak, streakLength);
    } else if (streakKind === 'loss') {
      longestLossStreak = Math.max(longestLossStreak, streakLength);
    }
  }

  const netPl = grossProfit - grossLoss;
  const averageWin = wins > 0 ? grossProfit / wins : 0;
  const averageLoss = losses > 0 ? grossLoss / losses : 0;

  return {
    trades: ordered.length,
    wins,
    losses,
    scratches,
    winRate: (wins / ordered.length) * 100,
    netPl,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    averageWin,
    averageLoss,
    winLossRatio: averageLoss > 0 ? averageWin / averageLoss : null,
    expectancy: netPl / ordered.length,
    largestWin,
    largestLoss,
    maxDrawdown,
    longestWinStreak,
    longestLossStreak,
    currentStreak: { kind: streakKind, length: streakLength },
  };
}

/* ------------------------------------------------------------------ *
 * Breakdowns — "which of these is actually making me money"
 * ------------------------------------------------------------------ */

export type Breakdown = {
  label: string;
  trades: number;
  wins: number;
  netPl: number;
  /** Percentage, 0-100, of this group's trades. */
  winRate: number;
};

/**
 * Groups trades by whatever `keyOf` returns and totals each group, best net P/L
 * first. Returning several keys for one trade puts it in several groups, which
 * is how the mood breakdown works — so for that one, group trade counts sum to
 * more than the number of trades. Every other breakdown returns one key and
 * partitions cleanly.
 *
 * A trade whose `keyOf` returns an empty array is dropped rather than bucketed
 * under a placeholder: an untagged trade is absent data, and giving it a
 * "None" row would put it in competition with real setups in the rankings.
 */
export function breakdownBy(
  trades: StatsTrade[],
  keyOf: (trade: StatsTrade) => string[],
): Breakdown[] {
  const groups = new Map<string, { trades: number; wins: number; netPl: number }>();

  for (const trade of trades) {
    for (const key of keyOf(trade)) {
      const group = groups.get(key) ?? { trades: 0, wins: 0, netPl: 0 };
      group.trades += 1;
      group.netPl += trade.pl;
      if (trade.pl > 0) {
        group.wins += 1;
      }
      groups.set(key, group);
    }
  }

  return [...groups.entries()]
    .map(([label, group]) => ({
      label,
      trades: group.trades,
      wins: group.wins,
      netPl: group.netPl,
      winRate: group.trades > 0 ? (group.wins / group.trades) * 100 : 0,
    }))
    .sort((a, b) => b.netPl - a.netPl);
}

/** Monday-first, matching the calendar screen's column order. */
const WEEKDAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/**
 * Day-of-week performance, ordered Monday-to-Sunday rather than by P/L.
 *
 * This is the one breakdown that is not a ranking: a week has an inherent order
 * and shuffling it so Thursday comes first makes the shape of the week harder
 * to read, not easier. Days with no trades are omitted.
 */
export function breakdownByWeekday(trades: StatsTrade[]): Breakdown[] {
  const byLabel = new Map(
    breakdownBy(trades, (trade) => [
      WEEKDAY_LABELS[(new Date(trade.created_at).getDay() + 6) % 7],
    ]).map((row) => [row.label, row]),
  );

  return WEEKDAY_LABELS.map((label) => byLabel.get(label)).filter(
    (row): row is Breakdown => row !== undefined,
  );
}

/* ------------------------------------------------------------------ *
 * Daily series — the bar chart's input
 * ------------------------------------------------------------------ */

export type DailyPl = {
  /** Local yyyy-mm-dd. */
  key: string;
  date: Date;
  pl: number;
  trades: number;
};

/** Local yyyy-mm-dd. Mirrors `dayKey` in calendar.ts. */
function localDayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Net P/L per day, oldest first — one entry per day that has trades.
 *
 * Days without trades are skipped rather than emitted as zero bars. A trader
 * who works Monday to Friday would otherwise get two dead columns every week,
 * and across a quarter the real bars would be squeezed into a third of the
 * width by whitespace representing weekends. This is a chart of trading days,
 * which is also why `calendar.ts` can't supply it — that builds a fixed
 * calendar grid, blanks included, for exactly one month.
 */
export function buildDailySeries(trades: StatsTrade[]): DailyPl[] {
  const byDay = new Map<string, DailyPl>();

  for (const trade of trades) {
    const date = new Date(trade.created_at);
    const key = localDayKey(date);

    const existing = byDay.get(key);
    if (existing) {
      existing.pl += trade.pl;
      existing.trades += 1;
      continue;
    }

    byDay.set(key, {
      key,
      // Midnight local, so every trade on the day maps to one bar position.
      date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
      pl: trade.pl,
      trades: 1,
    });
  }

  return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}
