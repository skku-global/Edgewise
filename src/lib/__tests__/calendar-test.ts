/**
 * Tests for the calendar grid and heatmap.
 *
 * Everything here is timezone-local by design: a trade is placed on the day its
 * timestamp renders as *for the user*, because that is the day they will look
 * for it. So the fixtures are built from local date parts rather than from UTC
 * strings — a `Z`-suffixed literal would put these assertions at the mercy of
 * whichever machine runs them.
 */

import type { ColorTokens } from '@/constants/theme';

import {
  buildMonth,
  dayFill,
  dayKey,
  isOnDay,
  mondayIndex,
  monthKey,
  monthLabel,
  type CalendarSource,
  type DayBucket,
} from '../calendar';

/**
 * `dayFill` reads exactly three tokens. Passing a stub rather than a real theme
 * keeps the test independent of the palette — it checks the alpha ramp, which is
 * the logic, not the hex values, which are design.
 */
const COLOR = {
  border: '#AAAAAA',
  gain: '#1F7A4C',
  loss: '#B23A3A',
} as unknown as ColorTokens;

let seq = 0;
const trade = (y: number, m: number, d: number, pl: number, hour = 12): CalendarSource => ({
  id: (seq += 1),
  created_at: new Date(y, m, d, hour).toISOString(),
  pl,
});

const bucket = (over: Partial<DayBucket>): DayBucket => ({
  key: '2026-08-12',
  date: new Date(2026, 7, 12),
  pl: 0,
  trades: 0,
  wins: 0,
  ...over,
});

describe('mondayIndex', () => {
  it('puts Monday first and Sunday last', () => {
    // 2026-08-10 is a Monday.
    expect(mondayIndex(new Date(2026, 7, 10))).toBe(0);
    expect(mondayIndex(new Date(2026, 7, 15))).toBe(5);
    expect(mondayIndex(new Date(2026, 7, 16))).toBe(6);
  });
});

describe('dayKey / monthKey', () => {
  it('zero-pads the month and day', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(monthKey(new Date(2026, 0, 5))).toBe('2026-01');
  });

  it('ignores the time of day', () => {
    expect(dayKey(new Date(2026, 7, 12, 23, 59))).toBe('2026-08-12');
  });
});

describe('isOnDay', () => {
  it('matches a trade to its local calendar day', () => {
    expect(isOnDay(trade(2026, 7, 12, 10), new Date(2026, 7, 12))).toBe(true);
  });

  it('does not match the next day', () => {
    expect(isOnDay(trade(2026, 7, 12, 10, 23), new Date(2026, 7, 13))).toBe(false);
  });
});

describe('buildMonth', () => {
  it('describes the month the anchor falls in', () => {
    const month = buildMonth(new Date(2026, 7, 12), []);
    expect(month.monthKey).toBe('2026-08');
    expect(month.daysInMonth).toBe(31);
    expect(month.days).toHaveLength(31);
    expect(month.days[0].key).toBe('2026-08-01');
  });

  it('counts the blanks before the 1st, Monday-first', () => {
    // 1 August 2026 is a Saturday, so five cells come before it.
    expect(buildMonth(new Date(2026, 7, 12), []).leadingBlanks).toBe(5);
  });

  it('gets February right in a leap year and a common year', () => {
    expect(buildMonth(new Date(2024, 1, 10), []).daysInMonth).toBe(29);
    expect(buildMonth(new Date(2026, 1, 10), []).daysInMonth).toBe(28);
  });

  it('aggregates every trade on a day', () => {
    const month = buildMonth(new Date(2026, 7, 1), [
      trade(2026, 7, 12, 30, 9),
      trade(2026, 7, 12, -10, 15),
      trade(2026, 7, 12, 0, 17),
    ]);

    const twelfth = month.days[11];
    expect(twelfth.key).toBe('2026-08-12');
    expect(twelfth.trades).toBe(3);
    expect(twelfth.pl).toBe(20);
    // A scratch is a trade but not a win.
    expect(twelfth.wins).toBe(1);
  });

  it('leaves untraded days empty', () => {
    const month = buildMonth(new Date(2026, 7, 1), [trade(2026, 7, 12, 30)]);
    expect(month.days[0]).toMatchObject({ trades: 0, pl: 0, wins: 0 });
  });

  it('ignores trades outside the month, so the caller can pass everything', () => {
    const month = buildMonth(new Date(2026, 7, 1), [
      trade(2026, 6, 31, 500),
      trade(2026, 8, 1, 500),
      trade(2026, 7, 12, 30),
    ]);
    expect(month.days.reduce((sum, day) => sum + day.trades, 0)).toBe(1);
    expect(month.days.reduce((sum, day) => sum + day.pl, 0)).toBe(30);
  });
});

describe('dayFill', () => {
  it('shows an untraded day as a hairline, not as a colour', () => {
    expect(dayFill(bucket({ trades: 0 }), COLOR)).toBe(COLOR.border);
  });

  it('still marks a break-even day as traded', () => {
    expect(dayFill(bucket({ trades: 2, pl: 0 }), COLOR)).toBe(`${COLOR.gain}1F`);
  });

  it('deepens green as a winning day gets bigger', () => {
    const alphas = [10, 50, 150, 250].map((pl) =>
      dayFill(bucket({ trades: 1, pl }), COLOR).slice(-2),
    );
    expect(alphas).toEqual(['29', '59', '8c', 'cf']);
  });

  it('uses the loss colour for a losing day, on the same ramp', () => {
    expect(dayFill(bucket({ trades: 1, pl: -50 }), COLOR)).toBe(`${COLOR.loss}59`);
    expect(dayFill(bucket({ trades: 1, pl: -250 }), COLOR)).toBe(`${COLOR.loss}cf`);
  });

  it('clamps, so one huge day does not need its own shade', () => {
    expect(dayFill(bucket({ trades: 1, pl: 250 }), COLOR)).toBe(
      dayFill(bucket({ trades: 1, pl: 100_000 }), COLOR),
    );
  });

  it('emits eight hex digits, which is what makes the alpha work', () => {
    expect(dayFill(bucket({ trades: 1, pl: 10 }), COLOR)).toMatch(/^#[0-9a-fA-F]{8}$/);
  });
});

describe('monthLabel', () => {
  it('names the month and year', () => {
    expect(monthLabel(new Date(2026, 7, 1))).toBe('August 2026');
  });
});
