/**
 * Supabase auth errors, rephrased for the person reading them.
 *
 * Supabase's own messages are written for whoever is holding the SDK docs. These
 * are the failures a user can actually reach, rewritten into something they can
 * act on; anything unrecognised falls through to the original text rather than
 * being flattened into a useless "something went wrong".
 *
 * This lives apart from `lib/session.tsx` for the same reason `lib/auth-link.ts`
 * does: it is a pure string function, and a pure string function belongs
 * somewhere a test can call it without mounting a provider or constructing a
 * Supabase client.
 */

import type { AuthError } from '@supabase/supabase-js';

/**
 * The one error message a screen needs to recognise rather than just display.
 *
 * "Email not confirmed" is the only failure with a remedy the app can offer
 * directly — resend the link — so the sign-in screen has to be able to tell it
 * apart from the others. Comparing against this constant keeps that check
 * anchored to the string produced below; matching on Supabase's own wording
 * would put a copy of their message in a screen, where a rephrasing upstream
 * silently removes the resend button.
 */
export const UnconfirmedEmailError =
  'Confirm your email address first — check your inbox for the link.';

/**
 * True when the request never reached Supabase at all.
 *
 * supabase-js turns a thrown `fetch` into `AuthRetryableFetchError` with
 * **status 0** — that pairing is the signal, and it is the only one that is
 * stable, because the message itself is written by the platform: Chrome says
 * "Failed to fetch", Safari "Load failed", Firefox "NetworkError when
 * attempting to fetch resource", React Native "Network request failed". The
 * wording checks are a second net for the same condition arriving down a path
 * that did not set the status.
 *
 * Worth separating from a retryable error that *does* carry a status: a 503 is
 * Supabase answering that it is briefly unavailable, which is a wait-and-retry.
 * Status 0 means nothing answered — a dead hostname, no network, or a blocked
 * request — and no amount of retrying fixes those.
 */
function isUnreachable(error: AuthError, status: number, raw: string): boolean {
  if (error.name === 'AuthRetryableFetchError' && status === 0) {
    return true;
  }

  return (
    raw.includes('failed to fetch') ||
    raw.includes('network request failed') ||
    raw.includes('networkerror') ||
    raw.includes('load failed')
  );
}

/**
 * @param error The error supabase-js returned.
 * @param backendHost Hostname the client is pointed at, named in the
 *   unreachable case. Without it that failure can only be described in the
 *   abstract, and "check your connection" sends someone to look at their wifi
 *   when the real cause is a Supabase project that no longer exists at that
 *   address — the two are indistinguishable from inside the app, but naming the
 *   host lets whoever is reading tell them apart in one step.
 */
export function describeAuthError(error: AuthError, backendHost?: string): string {
  const status = error.status ?? 0;
  const raw = error.message.toLowerCase();

  // First, because a dead backend produces *every* other symptom in this file as
  // a side effect — a sign-in that cannot reach the server is not a credential
  // problem, and telling someone their password is wrong when the request never
  // left the browser is the most expensive wrong answer here.
  if (isUnreachable(error, status, raw)) {
    const where = backendHost ? ` at ${backendHost}` : '';

    return (
      `Cannot reach the Edgewise backend${where}. Nothing answered, so this is ` +
      `not your email or password. Either this device is offline, or the ` +
      `Supabase project is paused or has been deleted — a paused free-tier ` +
      `project stops resolving entirely, which looks exactly like being offline. ` +
      `Check the project is running in the Supabase dashboard.`
    );
  }
  // A retryable error that did carry a status is the opposite case: something
  // answered, and said to come back shortly.
  if (error.name === 'AuthRetryableFetchError') {
    return 'The server is temporarily unavailable. Try again in a moment.';
  }

  // The built-in email server only delivers to addresses belonging to the
  // Supabase organisation that owns the project. Everything else is refused
  // with this, and the raw message gives no hint why — so it gets the longest
  // rewrite in the file, because without it the failure is unguessable.
  if (raw.includes('not authorized') && raw.includes('email')) {
    return 'Supabase will not email that address. Its built-in mail server only sends to your own organisation members — use the address on your Supabase account, add custom SMTP, or turn off email confirmation while developing.';
  }
  if (raw.includes('over_email_send_rate_limit') || raw.includes('email rate limit')) {
    return 'Email limit reached. The built-in mail server allows only a couple of messages an hour — wait, or set up custom SMTP.';
  }
  // Supabase's own wording here is "For security purposes, you can only request
  // this after N seconds", which reads as a fault rather than a cooldown.
  if (raw.includes('only request this after') || raw.includes('for security purposes')) {
    return 'Just a moment — another email was sent very recently. Try again shortly.';
  }
  if (status === 429 || raw.includes('rate limit')) {
    return 'Too many attempts. Wait a couple of minutes and try again.';
  }
  if (raw.includes('invalid login credentials')) {
    return 'That email and password combination does not match an account.';
  }
  if (raw.includes('email not confirmed')) {
    return UnconfirmedEmailError;
  }
  if (raw.includes('already registered') || raw.includes('already been registered')) {
    return 'An account already exists for that email. Sign in instead.';
  }
  if (raw.includes('should be different from the old password')) {
    return 'That is already your password. Choose a different one.';
  }
  if (raw.includes('password should be at least')) {
    // Server-side policy, which can be stricter than the client's minimum.
    return error.message;
  }
  // What `updateUser` returns when the recovery session has already lapsed.
  if (raw.includes('auth session missing') || raw.includes('session_not_found')) {
    return 'Your reset link has expired. Request a new one and try again.';
  }

  return error.message;
}
