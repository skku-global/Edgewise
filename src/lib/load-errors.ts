/**
 * What to say when the trade list will not load.
 *
 * Lives here rather than inside `use-trades.tsx` for the same reason
 * `auth-errors.ts` exists: it is a pure string mapping, it is the text a stuck
 * user actually reads, and while it sat private inside the hook it had no tests
 * at all. Five screens render its output — dashboard, trades, calendar, reports
 * and chat — each behind a Retry button, so a message that misdescribes the
 * cause sends the reader round a loop that cannot terminate.
 */

import { describeUnreachableBackend, isUnreachableMessage } from '@/lib/auth-errors';
import { BACKEND_HOST } from '@/lib/supabase';

/**
 * Turn a load failure into something the reader can act on.
 *
 * The order matters. An unreachable host has to be checked first, because it
 * imitates every other case: the SELECT did not fail, it never arrived, so
 * nothing downstream — schema, permissions, filters — has been tested yet.
 *
 * It cannot be recognised the way the Postgres cases are. postgrest-js
 * populates neither `code` nor `hint` for client-side network failures, on the
 * stated reasoning that both fields belong to upstream services, so a dead host
 * arrives as `{ code: '', message: 'TypeError: Failed to fetch' }` and the
 * message is the only thing left to read. Matching on `code` alone — which is
 * all this did before — could therefore only ever fall through to the generic
 * line below.
 *
 * That generic line is also the wrong promise to make. "right now" says wait and
 * try again, which is true of a blip and false of a paused project: a paused
 * free-tier project loses its DNS record and will not come back on its own.
 *
 * Naming a file or a dashboard in these messages is deliberate, and matches the
 * 42703 case that was already here: this app's reader is the person who can fix
 * it, so the message says which thing to go and touch.
 */
export function describeLoadError(err: unknown): string {
  const failure = err as { code?: string; message?: string } | null;

  if (isUnreachableMessage(failure?.message ?? '')) {
    return describeUnreachableBackend(BACKEND_HOST);
  }

  // 42703 undefined_column — migration not run yet.
  // 42P01 undefined_table — pointed at a project with no `trades` table at all.
  if (failure?.code === '42703' || failure?.code === '42P01') {
    return 'Your database is missing the broker-sync columns. Run scripts/add-broker-sync.sql in the Supabase SQL editor, then pull to refresh.';
  }

  return 'Unable to load your trades right now.';
}
