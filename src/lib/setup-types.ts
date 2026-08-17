/**
 * Canonical setup types for the Add Trade dropdown.
 *
 * `setup_type` used to be a free-text field, which left the live table holding
 * near-miss variants ("breakout", "Break out", "BO") that the dashboard and
 * Pattern Engine then counted as separate setups. The dropdown constrains new
 * rows to this list; `normalizeSetup` keeps the older rows groupable.
 */

export const SETUP_TYPES = [
  'Breakout',
  'Pullback',
  'Reversal',
  'Trend continuation',
  'Other',
] as const;

export type SetupType = (typeof SETUP_TYPES)[number];

/** Lowercase canonical form -> canonical label, for exact-ish matching. */
const BY_LOWER = new Map<string, SetupType>(
  SETUP_TYPES.map((setup) => [setup.toLowerCase(), setup]),
);

/**
 * Extra spellings seen in free-text data, mapped onto a canonical label. Keys
 * are compared against the input with all non-letters stripped, so "break-out",
 * "break out" and "Break_Out" all collapse to the same key.
 */
const ALIASES: Record<string, SetupType> = {
  breakout: 'Breakout',
  bo: 'Breakout',
  breakouts: 'Breakout',
  pullback: 'Pullback',
  pb: 'Pullback',
  retrace: 'Pullback',
  retracement: 'Pullback',
  reversal: 'Reversal',
  reverse: 'Reversal',
  trendcontinuation: 'Trend continuation',
  continuation: 'Trend continuation',
  trend: 'Trend continuation',
  trendfollow: 'Trend continuation',
};

/**
 * Best-effort mapping of a stored `setup_type` onto a canonical label.
 *
 * Returns null when the value can't be matched, rather than forcing it to
 * "Other" — callers show the raw text instead, so a typo stays visible and
 * fixable rather than silently merging into the Other bucket.
 */
export function normalizeSetup(raw: string | null | undefined): SetupType | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  const exact = BY_LOWER.get(trimmed.toLowerCase());
  if (exact) {
    return exact;
  }

  const key = trimmed.toLowerCase().replace(/[^a-z]/g, '');
  return ALIASES[key] ?? null;
}

/** What to show in a table cell: the canonical label, else the raw text. */
export function displaySetup(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) {
    return '—';
  }
  return normalizeSetup(raw) ?? raw.trim();
}

/**
 * Filter options for the trades table: the canonical list plus any unmatched
 * values actually present, so legacy rows stay reachable instead of being
 * filtered into nothing.
 */
export function setupFilterOptions(rawValues: (string | null | undefined)[]): string[] {
  const extras = new Set<string>();

  for (const raw of rawValues) {
    const trimmed = raw?.trim();
    if (trimmed && !normalizeSetup(trimmed)) {
      extras.add(trimmed);
    }
  }

  return [...SETUP_TYPES, ...[...extras].sort((a, b) => a.localeCompare(b))];
}
