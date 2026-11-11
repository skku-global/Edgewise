/**
 * Formatting helpers shared by the trading screens. Single place so every
 * screen renders numbers and dates the same way.
 */

/** Fixed-decimal money with an explicit sign, so +2.00 reads as a win. */
export function formatSigned(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(2)}`;
}

/** Short date label for table rows, e.g. "Aug 10". */
export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Full date + time for the detail sheet, e.g. "Aug 10, 2026, 3:41 PM". */
export function formatFullDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * "just now", "5m ago", "3h ago", "2d ago" — for the home screen's list of
 * trades in flight, where "how long has this been open" matters more than the
 * clock time. Anything older than a week falls back to the short date, because
 * "23d ago" is harder to place than "Oct 19".
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 60_000) {
    return 'just now';
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  return formatShortDate(iso);
}

/** Price with at most two decimals, keeping whole numbers clean. */
export function formatPrice(value: number): string {
  return value % 1 === 0 ? `${value}` : value.toFixed(2);
}

/**
 * Unsigned money, for figures that only make sense as a size — average loss,
 * max drawdown. `formatSigned` would print "-40.00" for a 40-unit drawdown and
 * invite reading it as a further loss on top of the number beside it.
 */
export function formatAmount(value: number): string {
  return Math.abs(value).toFixed(2);
}

/**
 * A ratio to two decimals, or an em dash when it has no value.
 *
 * Profit factor and win/loss ratio are both null with no losing trades — the
 * division is undefined, not infinite. The caller prints the caption explaining
 * that; this just refuses to invent a number for it.
 */
export function formatRatio(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}
