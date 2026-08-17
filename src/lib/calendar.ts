/**
 * Calendar month grid + per-day trade aggregation for the heatmap screen.
 *
 * All functions are pure and timezone-local: a trade logged on `created_at`
 * is placed on the calendar day that date renders as in the user's timezone,
 * which is the day they will look for it.
 */

import type { ColorTokens } from '@/constants/theme';

export type DayBucket = {
  key: string; // yyyy-mm-dd, local time — object identity for React keys
  date: Date;
  /** Net P/L of every trade on this day. */
  pl: number;
  trades: number;
  /** Sum of only the winning trades, for the win-rate footer. */
  wins: number;
};

export type MonthData = {
  /** yyyy-mm of the displayed month (same format `dayKey` uses). */
  monthKey: string;
  /** First day of the month. */
  firstDay: Date;
  /** Number of days in the month. */
  daysInMonth: number;
  /** 0-6, Monday-first (Monday = 0). Number of blank cells before day 1. */
  leadingBlanks: number;
  /** One entry per day of the month; index 0 is the 1st. */
  days: DayBucket[];
};

export type CalendarTrade = {
  id: number;
  created_at: string;
};

export type CalendarSource = CalendarTrade & { pl: number };

/** Monday-first weekday: 0..6, Monday = 0. */
export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** Local yyyy-mm-dd, zero-padded. */
export function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local yyyy-mm. */
export function monthKey(date: Date): string {
  return dayKey(date).slice(0, 7);
}

/** Whether the trade's timestamp falls on `date` (in local time). */
export function isOnDay(trade: CalendarSource, date: Date): boolean {
  return dayKey(new Date(trade.created_at)) === dayKey(date);
}

/**
 * Builds the grid for the month containing `anchor`, aggregating `trades` by
 * local calendar day. Trades outside the month are ignored, so the result is
 * stable regardless of how many the caller passes.
 */
export function buildMonth(anchor: Date, trades: CalendarSource[]): MonthData {
  const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const daysInMonth = new Date(
    anchor.getFullYear(),
    anchor.getMonth() + 1,
    0,
  ).getDate();

  const days: DayBucket[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth(), day);
    const key = dayKey(date);

    let pl = 0;
    let tradesOnDay = 0;
    let wins = 0;

    for (const trade of trades) {
      if (!isOnDay(trade, date)) {
        continue;
      }
      pl += trade.pl;
      tradesOnDay += 1;
      if (trade.pl > 0) {
        wins += 1;
      }
    }

    days.push({ key, date, pl, trades: tradesOnDay, wins });
  }

  return {
    monthKey: monthKey(firstDay),
    firstDay,
    daysInMonth,
    leadingBlanks: mondayIndex(firstDay),
    days,
  };
}

/**
 * Heatmap fill for a day, scaled to its net P/L.
 *
 * Takes the active scheme's colour tokens rather than importing a palette, which
 * keeps the module pure — it has no opinion about light or dark, and stays
 * testable by passing either theme in.
 *
 * The palette is locked, so intensity is expressed as alpha on the gain/loss
 * tokens rather than as new colours. That does assume those two tokens are
 * 6-digit hex, since the alpha is appended as a 7th and 8th digit; both schemes
 * satisfy that, and a token expressed as `rgba()` would have to change here too.
 */
export function dayFill(day: DayBucket, color: ColorTokens): string {
  if (day.trades === 0) {
    return color.border;
  }
  if (day.pl === 0) {
    return `${color.gain}1F`; // 12% — a scratch day still shows as traded
  }

  // 3-, 2-, 1-sigma bands of |pl|, each stepped a third of the way to full.
  const magnitude = Math.min(Math.abs(day.pl), 300);
  const level = magnitude > 200 ? 3 : magnitude > 100 ? 2 : magnitude > 25 ? 1 : 0;
  const alpha = [0x29, 0x59, 0x8c, 0xcf][level];
  const base = day.pl > 0 ? color.gain : color.loss;

  return `${base}${alpha.toString(16).padStart(2, '0')}`;
}

/** Readable label for the month the grid displays. */
export function monthLabel(date: Date): string {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
