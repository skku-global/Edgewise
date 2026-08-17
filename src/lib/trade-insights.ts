/**
 * Cross-references trades against their logged moods to surface trading
 * psychology patterns — most usefully, whether trades logged under stressed
 * moods win less often than trades logged under composed ones.
 */

/** Moods the trades screen offers, split by emotional state. */
export const COMPOSED_MOODS = ['calm', 'confident'] as const;
export const STRESSED_MOODS = ['anxious', 'frustrated', 'impatient'] as const;

/**
 * Below this many trades in a group, a win-rate gap is noise rather than a
 * pattern — two coin flips will happily differ by 50 points. The insight says
 * it needs more data instead of asserting something it can't support.
 */
export const MIN_TRADES_PER_GROUP = 3;

export type MoodGroup = 'composed' | 'stressed';

export type AnalyzableTrade = {
  id: number;
  pl: number;
  moods: string[];
};

export type GroupStats = {
  trades: number;
  wins: number;
  winRate: number;
};

export type MoodInsight = {
  /** Short sentence for the dashboard. Always present. */
  summary: string;
  /** True when both groups cleared MIN_TRADES_PER_GROUP and could be compared. */
  conclusive: boolean;
  composed: GroupStats;
  stressed: GroupStats;
  /** composed.winRate - stressed.winRate, or null when not conclusive. */
  gap: number | null;
  /** Trades carrying both a composed and a stressed mood; excluded from groups. */
  mixed: number;
  /** Trades with no mood logged at all; excluded from groups. */
  untagged: number;
};

function classify(moods: string[]): MoodGroup | 'mixed' | 'none' {
  const composed = moods.some((m) =>
    (COMPOSED_MOODS as readonly string[]).includes(m.toLowerCase()),
  );
  const stressed = moods.some((m) =>
    (STRESSED_MOODS as readonly string[]).includes(m.toLowerCase()),
  );

  if (composed && stressed) return 'mixed';
  if (composed) return 'composed';
  if (stressed) return 'stressed';
  return 'none';
}

function statsFor(trades: AnalyzableTrade[]): GroupStats {
  const wins = trades.filter((t) => t.pl > 0).length;
  return {
    trades: trades.length,
    wins,
    winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
  };
}

/**
 * A trade counts toward a group if it carries a mood from that group. Trades
 * tagged with both kinds are counted as `mixed` rather than being attributed to
 * either side, so a single trade can never inflate both win rates at once.
 */
export function analyzeMoodPatterns(trades: AnalyzableTrade[]): MoodInsight {
  const composedTrades: AnalyzableTrade[] = [];
  const stressedTrades: AnalyzableTrade[] = [];
  let mixed = 0;
  let untagged = 0;

  for (const trade of trades) {
    switch (classify(trade.moods)) {
      case 'composed':
        composedTrades.push(trade);
        break;
      case 'stressed':
        stressedTrades.push(trade);
        break;
      case 'mixed':
        mixed += 1;
        break;
      default:
        untagged += 1;
    }
  }

  const composed = statsFor(composedTrades);
  const stressed = statsFor(stressedTrades);

  const tagged = composed.trades + stressed.trades + mixed;
  if (tagged === 0) {
    return {
      summary:
        'No moods logged yet. Tag how you felt after saving a trade to see whether your mindset moves your win rate.',
      conclusive: false,
      composed,
      stressed,
      gap: null,
      mixed,
      untagged,
    };
  }

  // Not enough on one or both sides to say anything honest about a difference.
  if (
    composed.trades < MIN_TRADES_PER_GROUP ||
    stressed.trades < MIN_TRADES_PER_GROUP
  ) {
    const parts: string[] = [];
    if (composed.trades > 0) {
      parts.push(`${composed.trades} calm/confident`);
    }
    if (stressed.trades > 0) {
      parts.push(`${stressed.trades} anxious/frustrated`);
    }

    const detail = parts.length > 0 ? ` So far: ${parts.join(', ')}.` : '';
    return {
      summary: `Not enough mood data to spot a pattern yet — ${MIN_TRADES_PER_GROUP} trades of each kind are needed.${detail}`,
      conclusive: false,
      composed,
      stressed,
      gap: null,
      mixed,
      untagged,
    };
  }

  const gap = composed.winRate - stressed.winRate;
  const composedPct = composed.winRate.toFixed(0);
  const stressedPct = stressed.winRate.toFixed(0);
  const gapPts = Math.abs(gap).toFixed(0);

  let summary: string;
  if (Math.abs(gap) < 1) {
    summary = `Mood is not moving your results: calm/confident trades win ${composedPct}% versus ${stressedPct}% when anxious or frustrated.`;
  } else if (gap > 0) {
    summary = `Your calm and confident trades win ${composedPct}% of the time versus ${stressedPct}% when anxious or frustrated — ${gapPts} points better composed.`;
  } else {
    summary = `Unexpectedly, your anxious and frustrated trades win ${stressedPct}% versus ${composedPct}% when calm or confident — ${gapPts} points better under stress.`;
  }

  return {
    summary,
    conclusive: true,
    composed,
    stressed,
    gap,
    mixed,
    untagged,
  };
}
