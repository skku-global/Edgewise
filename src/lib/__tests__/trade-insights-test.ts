/**
 * Tests for the mood-pattern insight.
 *
 * This is the one number in the app that makes a claim about the user rather
 * than about their account, so the interesting cases are the ones where it must
 * refuse to make it: too little data, and a trade tagged both calm and
 * frustrated. Two coin flips will happily differ by fifty points, and an app
 * that told a trader their mindset was costing them money on the strength of
 * four trades would be doing harm with confidence.
 */

import {
  MIN_TRADES_PER_GROUP,
  analyzeMoodPatterns,
  type AnalyzableTrade,
} from '../trade-insights';

let seq = 0;

function t(pl: number, moods: string[] = []): AnalyzableTrade {
  return { id: (seq += 1), pl, moods };
}

/** `count` trades with the given moods, `wins` of them profitable. */
function group(count: number, wins: number, moods: string[]): AnalyzableTrade[] {
  return Array.from({ length: count }, (_, i) => t(i < wins ? 10 : -10, moods));
}

beforeEach(() => {
  seq = 0;
});

describe('analyzeMoodPatterns', () => {
  it('asks for moods when none have been logged', () => {
    const insight = analyzeMoodPatterns([t(10), t(-5)]);
    expect(insight.conclusive).toBe(false);
    expect(insight.gap).toBeNull();
    expect(insight.untagged).toBe(2);
    expect(insight.summary).toMatch(/No moods logged yet/);
  });

  it('says the same for no trades at all', () => {
    expect(analyzeMoodPatterns([]).conclusive).toBe(false);
  });

  it('refuses to compare when one side is too thin', () => {
    const insight = analyzeMoodPatterns([
      ...group(MIN_TRADES_PER_GROUP, 3, ['calm']),
      ...group(MIN_TRADES_PER_GROUP - 1, 0, ['anxious']),
    ]);

    expect(insight.conclusive).toBe(false);
    expect(insight.gap).toBeNull();
    expect(insight.summary).toMatch(/Not enough mood data/);
    // It still reports what it has, so the user can see how close they are.
    expect(insight.summary).toMatch(/3 calm\/confident/);
    expect(insight.summary).toMatch(/2 anxious\/frustrated/);
  });

  it('names only the side that has trades', () => {
    const insight = analyzeMoodPatterns(group(2, 1, ['calm']));
    expect(insight.summary).toMatch(/2 calm\/confident/);
    expect(insight.summary).not.toMatch(/anxious\/frustrated\./);
  });

  it('compares once both sides clear the threshold', () => {
    const insight = analyzeMoodPatterns([
      ...group(4, 3, ['confident']),
      ...group(4, 1, ['frustrated']),
    ]);

    expect(insight.conclusive).toBe(true);
    expect(insight.composed).toEqual({ trades: 4, wins: 3, winRate: 75 });
    expect(insight.stressed).toEqual({ trades: 4, wins: 1, winRate: 25 });
    expect(insight.gap).toBe(50);
    expect(insight.summary).toMatch(/75% of the time versus 25%/);
    expect(insight.summary).toMatch(/50 points better composed/);
  });

  it('reports the uncomfortable direction just as plainly', () => {
    const insight = analyzeMoodPatterns([
      ...group(4, 1, ['calm']),
      ...group(4, 3, ['impatient']),
    ]);

    expect(insight.conclusive).toBe(true);
    expect(insight.gap).toBe(-50);
    expect(insight.summary).toMatch(/Unexpectedly/);
    expect(insight.summary).toMatch(/50 points better under stress/);
  });

  it('says so when mood makes no difference', () => {
    const insight = analyzeMoodPatterns([
      ...group(4, 2, ['calm']),
      ...group(4, 2, ['anxious']),
    ]);

    expect(insight.gap).toBe(0);
    expect(insight.summary).toMatch(/Mood is not moving your results/);
  });

  it('keeps a trade tagged both ways out of both groups', () => {
    // Otherwise one trade could inflate both win rates at once.
    const insight = analyzeMoodPatterns([
      ...group(3, 3, ['calm']),
      ...group(3, 0, ['anxious']),
      t(10, ['calm', 'anxious']),
    ]);

    expect(insight.mixed).toBe(1);
    expect(insight.composed.trades).toBe(3);
    expect(insight.stressed.trades).toBe(3);
  });

  it('counts a trade once even when it carries two moods from the same side', () => {
    const insight = analyzeMoodPatterns([t(10, ['calm', 'confident'])]);
    expect(insight.composed.trades).toBe(1);
    expect(insight.mixed).toBe(0);
  });

  it('ignores the case moods were stored in', () => {
    const insight = analyzeMoodPatterns([t(10, ['Calm']), t(-10, ['FRUSTRATED'])]);
    expect(insight.composed.trades).toBe(1);
    expect(insight.stressed.trades).toBe(1);
    expect(insight.untagged).toBe(0);
  });

  it('treats an unrecognised mood as no mood rather than guessing a side', () => {
    const insight = analyzeMoodPatterns([t(10, ['euphoric'])]);
    expect(insight.untagged).toBe(1);
    expect(insight.composed.trades).toBe(0);
    expect(insight.stressed.trades).toBe(0);
  });

  it('counts a scratch as a trade but not a win', () => {
    const insight = analyzeMoodPatterns([t(0, ['calm'])]);
    expect(insight.composed).toEqual({ trades: 1, wins: 0, winRate: 0 });
  });

  it('always returns a summary, whatever the data', () => {
    for (const trades of [[], [t(10)], group(2, 1, ['calm']), group(8, 4, ['calm'])]) {
      expect(analyzeMoodPatterns(trades).summary).toMatch(/\S/);
    }
  });
});
