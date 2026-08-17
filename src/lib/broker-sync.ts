/**
 * Broker sync, from the app's side.
 *
 * The MetaTrader advisor in `mt5/` does the pushing; this module is what the app
 * needs to know about it — the four values a user has to paste into the terminal,
 * and a reading of whether anything has actually arrived.
 *
 * It exists as its own file, with no React in it, because both halves are the
 * kind of thing that should be checked by a test rather than by staring at a
 * screen: the credential block is what makes the difference between a sync that
 * works and one that silently 401s, and the status is derived arithmetic over
 * rows the app already has.
 *
 * Nothing here fetches. `syncStatus` reads the trades `useTrades` already loaded,
 * so the connect screen adds no queries and cannot disagree with the dashboard
 * about how many trades are synced.
 */

import type { TradeRow } from './trade-table';
import { isImported } from './untagged';

/** The advisor file, as it appears in the repo and in MetaTrader's navigator. */
export const EA_FILE_NAME = 'EdgewiseSync.mq5';

/** Where MetaTrader expects it, relative to the data folder. */
export const EA_INSTALL_PATH = 'MQL5\\Experts\\EdgewiseSync.mq5';

/**
 * One row of the credential block the user pastes into the advisor's inputs.
 *
 * `secret` marks a value that should be masked on screen. Only the password is
 * secret: the project URL and the publishable key are compiled into every copy
 * of this app already, and treating them as sensitive teaches the wrong lesson
 * about which one actually matters.
 */
export type EaSetting = {
  /** The input's name in the advisor, exactly as MetaTrader shows it. */
  label: string;
  value: string;
  /** Shown under the row — what the value is and where it came from. */
  hint: string;
  secret?: boolean;
};

export type EaSettingsInput = {
  supabaseUrl: string;
  supabaseKey: string;
  email: string | null | undefined;
};

/**
 * The advisor's four inputs, filled in with this user's own values.
 *
 * This is the whole reason the connect screen exists. The same instructions in a
 * README are instructions for the person who wrote the app; here, every user
 * sees the project URL, the key and their own sign-in email already filled in,
 * and has to supply exactly one thing the app cannot know — their password.
 */
export function eaSettings({ supabaseUrl, supabaseKey, email }: EaSettingsInput): EaSetting[] {
  return [
    {
      label: 'SupabaseUrl',
      value: supabaseUrl,
      hint: 'Your journal’s address. No trailing slash.',
    },
    {
      label: 'SupabaseKey',
      value: supabaseKey,
      hint: 'The publishable key. Safe to paste — it grants nothing on its own.',
    },
    {
      label: 'SupabaseEmail',
      value: email ?? '',
      hint: 'The email you signed in with.',
    },
    {
      label: 'SupabasePassword',
      value: '',
      hint: 'Your own password. Typed straight into MetaTrader — the app never sees it.',
      secret: true,
    },
  ];
}

export type SyncStatus = {
  /** Imported trades in the loaded history. */
  synced: number;
  /** Manually typed trades, for context on what the sync is adding to. */
  manual: number;
  /** Distinct broker account numbers seen, most recent first. */
  accounts: string[];
  /** When the most recent imported trade closed. Null if none have arrived. */
  lastTradeAt: string | null;
  /** True once at least one trade has come in from a broker. */
  connected: boolean;
};

/**
 * What the sync has actually done, read off the loaded trades.
 *
 * `closed_at` is preferred over `created_at` for the timestamp: on a backfill,
 * every row is created within the same few seconds, so `created_at` would report
 * a three-month history as "all synced just now" and tell the user nothing about
 * whether the connection is still alive.
 */
export function syncStatus(
  trades: Pick<TradeRow, 'source' | 'account_login' | 'closed_at' | 'created_at'>[],
): SyncStatus {
  const imported = trades.filter((trade) => isImported(trade));

  // Sorted newest first so the account list leads with the one in use, rather
  // than whichever happened to be first in the query.
  const byRecency = [...imported].sort(
    (a, b) => whenClosed(b) - whenClosed(a),
  );

  const accounts: string[] = [];
  for (const trade of byRecency) {
    const login = trade.account_login?.trim();
    if (login && !accounts.includes(login)) {
      accounts.push(login);
    }
  }

  const newest = byRecency[0];

  return {
    synced: imported.length,
    manual: trades.length - imported.length,
    accounts,
    lastTradeAt: newest ? (newest.closed_at ?? newest.created_at) : null,
    connected: imported.length > 0,
  };
}

function whenClosed(trade: Pick<TradeRow, 'closed_at' | 'created_at'>): number {
  const stamp = Date.parse(trade.closed_at ?? trade.created_at);
  return Number.isFinite(stamp) ? stamp : 0;
}

/**
 * "just now" / "14 minutes ago" / "3 days ago".
 *
 * Coarse on purpose. The question this answers is "is my terminal still sending
 * trades", and to that question the difference between 14 and 15 minutes is
 * noise — while the difference between minutes and days is the whole answer.
 *
 * `now` is a parameter rather than a `new Date()` call so the output is testable
 * and so a screen rendering several of these cannot straddle a minute boundary.
 */
export function relativeTime(iso: string, now: Date): string {
  const then = Date.parse(iso);

  if (!Number.isFinite(then)) {
    return 'at an unknown time';
  }

  const seconds = Math.round((now.getTime() - then) / 1000);

  // A trade can close a few seconds in the future: MetaTrader stamps it from the
  // broker's server clock, which is not the phone's.
  if (seconds < 90) {
    return 'just now';
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minutes ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  }

  const days = Math.round(hours / 24);
  if (days < 30) {
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }

  const months = Math.round(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}
