import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import {
  UnconfirmedEmailError,
  describeAuthError,
  describeUnreachableBackend,
  isUnreachableAuthError,
} from '@/lib/auth-errors';

/**
 * The wording each platform uses when `fetch` itself fails. supabase-js passes
 * the platform's message straight through, so all four have to land on the same
 * branch — testing only Chrome's would leave the app unhelpful on a phone.
 */
const fetchFailures = [
  ['Chrome', 'Failed to fetch'],
  ['Safari', 'Load failed'],
  ['Firefox', 'NetworkError when attempting to fetch resource.'],
  ['React Native', 'Network request failed'],
] as const;

describe('describeAuthError — unreachable backend', () => {
  it.each(fetchFailures)('recognises %s wording', (_platform, message) => {
    const result = describeAuthError(new AuthRetryableFetchError(message, 0));

    expect(result).toContain('Cannot reach the Edgewise backend');
    expect(result).not.toContain(message);
  });

  it('names the host it failed to reach', () => {
    const result = describeAuthError(
      new AuthRetryableFetchError('Failed to fetch', 0),
      'nqwtetjrzoaggaerriew.supabase.co',
    );

    expect(result).toContain('at nqwtetjrzoaggaerriew.supabase.co');
  });

  it('omits the host clause when none is supplied', () => {
    const result = describeAuthError(new AuthRetryableFetchError('Failed to fetch', 0));

    expect(result).toContain('Cannot reach the Edgewise backend.');
    expect(result).not.toContain(' at ');
  });

  it('rules out the credentials the user just typed', () => {
    const result = describeAuthError(new AuthRetryableFetchError('Failed to fetch', 0));

    expect(result).toContain('not your email or password');
  });

  it('points at a paused or deleted project, since that is indistinguishable from offline', () => {
    const result = describeAuthError(new AuthRetryableFetchError('Failed to fetch', 0));

    expect(result).toMatch(/paused/i);
    expect(result).toMatch(/dashboard/i);
  });

  // Status 0 is the reliable signal; the wording net exists for the same failure
  // surfacing through a path that never set a status.
  it('catches the wording even on an error that is not the retryable class', () => {
    const result = describeAuthError(new AuthApiError('Failed to fetch', 0, undefined));

    expect(result).toContain('Cannot reach the Edgewise backend');
  });
});

describe('describeAuthError — retryable, but something answered', () => {
  it('separates a 503 from an unreachable host', () => {
    const result = describeAuthError(
      new AuthRetryableFetchError('Service temporarily unavailable', 503),
    );

    expect(result).toBe('The server is temporarily unavailable. Try again in a moment.');
    expect(result).not.toContain('Cannot reach');
  });
});

describe('describeAuthError — the network branch does not swallow the rest', () => {
  it('still reports bad credentials', () => {
    const result = describeAuthError(new AuthApiError('Invalid login credentials', 400, undefined));

    expect(result).toBe('That email and password combination does not match an account.');
  });

  it('still returns the exact constant the sign-in screen matches on', () => {
    const result = describeAuthError(new AuthApiError('Email not confirmed', 400, undefined));

    expect(result).toBe(UnconfirmedEmailError);
  });

  it('still explains the built-in mailer refusing an address', () => {
    const result = describeAuthError(
      new AuthApiError('Email address not authorized', 403, undefined),
    );

    expect(result).toContain('built-in mail server');
  });

  it('still reports a rate limit by status alone', () => {
    const result = describeAuthError(new AuthApiError('too many requests', 429, undefined));

    expect(result).toBe('Too many attempts. Wait a couple of minutes and try again.');
  });

  it('passes an unrecognised message through rather than flattening it', () => {
    const result = describeAuthError(new AuthApiError('Something quite specific', 400, undefined));

    expect(result).toBe('Something quite specific');
  });
});

/**
 * The predicate and the message are exported separately because the reachability
 * probe reaches the same conclusion without an `AuthError` to hand. These tests
 * hold the two producers to the same wording — if they drift, one outage reads as
 * two different problems depending on whether the visitor had signed in here
 * before.
 */
describe('isUnreachableAuthError', () => {
  it.each(fetchFailures)('is true for %s wording', (_platform, message) => {
    expect(isUnreachableAuthError(new AuthRetryableFetchError(message, 0))).toBe(true);
  });

  it('is true on status 0 whatever the message says', () => {
    expect(isUnreachableAuthError(new AuthRetryableFetchError('something else entirely', 0))).toBe(
      true,
    );
  });

  // Something answered. Retrying is the right advice, and it is a different
  // message, so this must not be swallowed by the unreachable branch.
  it('is false for a retryable error that carries a status', () => {
    expect(isUnreachableAuthError(new AuthRetryableFetchError('Service Unavailable', 503))).toBe(
      false,
    );
  });

  it.each([
    ['bad credentials', new AuthApiError('Invalid login credentials', 400, undefined)],
    ['unconfirmed email', new AuthApiError('Email not confirmed', 400, undefined)],
    ['a rate limit', new AuthApiError('too many requests', 429, undefined)],
  ])('is false for %s', (_label, error) => {
    expect(isUnreachableAuthError(error)).toBe(false);
  });
});

describe('describeUnreachableBackend', () => {
  it('says the same thing describeAuthError says, so one outage reads one way', () => {
    const viaError = describeAuthError(
      new AuthRetryableFetchError('Failed to fetch', 0),
      'nqwtetjrzoaggaerriew.supabase.co',
    );

    expect(describeUnreachableBackend('nqwtetjrzoaggaerriew.supabase.co')).toBe(viaError);
  });

  it('names the host when it has one', () => {
    expect(describeUnreachableBackend('example.supabase.co')).toContain('at example.supabase.co');
  });

  it('still reads as a sentence without one', () => {
    const result = describeUnreachableBackend();

    expect(result).toContain('Cannot reach the Edgewise backend.');
    expect(result).not.toContain(' at undefined');
  });

  // The two things this message exists to do: stop the user blaming their
  // password, and point at the one place that can actually settle it.
  it('rules out the credentials and names the dashboard', () => {
    const result = describeUnreachableBackend('example.supabase.co');

    expect(result).toContain('not your email or password');
    expect(result).toContain('Supabase dashboard');
  });
});
