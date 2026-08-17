/**
 * Tests for the auth email link parser.
 *
 * The cases are taken from what Supabase actually sends rather than from what
 * the format suggests: a recovery link on native, a recovery link on web, an
 * expired link, and a link that has already been clicked. Those four are the
 * whole surface, and three of them are failures — which is the point, because
 * the failure paths are the ones nobody exercises by hand until a real user
 * reports a dead link.
 */

import {
  describeAuthLinkError,
  EmptyAuthLink,
  hasAuthPayload,
  parseAuthFragment,
} from '../auth-link';

describe('parseAuthFragment', () => {
  it('reads a recovery link arriving on the native scheme', () => {
    const link = parseAuthFragment(
      'edgewise:///reset-password#access_token=ey.aa.bb&refresh_token=r3fr35h&expires_in=3600&token_type=bearer&type=recovery',
    );

    expect(link.accessToken).toBe('ey.aa.bb');
    expect(link.refreshToken).toBe('r3fr35h');
    expect(link.type).toBe('recovery');
    expect(link.error).toBeNull();
  });

  it('reads a signup confirmation link arriving on localhost', () => {
    const link = parseAuthFragment(
      'http://localhost:8081/#access_token=ey.cc&refresh_token=r2&type=signup',
    );

    expect(link.accessToken).toBe('ey.cc');
    expect(link.type).toBe('signup');
  });

  it('reads window.location.hash, with and without the leading #', () => {
    expect(parseAuthFragment('#access_token=a&type=recovery').type).toBe('recovery');
    expect(parseAuthFragment('access_token=a&type=recovery').type).toBe('recovery');
  });

  it('reads an expired link', () => {
    const link = parseAuthFragment(
      'http://localhost:8081/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );

    expect(link.accessToken).toBeNull();
    expect(link.error).toBe('access_denied');
    expect(link.errorCode).toBe('otp_expired');
    // '+' is a space here, not a literal plus.
    expect(link.errorDescription).toBe('Email link is invalid or has expired');
  });

  it('reads an error returned on the query string instead of the fragment', () => {
    const link = parseAuthFragment(
      'http://localhost:8081/reset-password?error=server_error&error_description=Unable%20to%20verify',
    );

    expect(link.error).toBe('server_error');
    expect(link.errorDescription).toBe('Unable to verify');
  });

  it('lets the fragment win when both carry the same key', () => {
    // The implicit flow is fragment-first; a stale query param must not shadow
    // the real outcome.
    const link = parseAuthFragment('http://x/y?type=signup#type=recovery');

    expect(link.type).toBe('recovery');
  });

  it('returns nothing for links that are not auth links', () => {
    expect(parseAuthFragment('edgewise:///trades/42')).toEqual(EmptyAuthLink);
    expect(parseAuthFragment('http://localhost:8081/')).toEqual(EmptyAuthLink);
    expect(parseAuthFragment('')).toEqual(EmptyAuthLink);
    expect(parseAuthFragment(null)).toEqual(EmptyAuthLink);
    expect(parseAuthFragment(undefined)).toEqual(EmptyAuthLink);
  });

  it('survives a truncated link instead of throwing', () => {
    // An email client wrapped the line and the token lost its tail, leaving a
    // dangling percent. decodeURIComponent throws on this; the app must not.
    expect(() => parseAuthFragment('http://x/#access_token=ab%')).not.toThrow();
    expect(parseAuthFragment('http://x/#access_token=ab%').accessToken).toBe('ab%');
  });

  it('treats an empty value as absent, not as an empty string', () => {
    // `type=` with nothing after it would otherwise read as a valid link type.
    const link = parseAuthFragment('#access_token=a&type=');

    expect(link.type).toBeNull();
  });
});

describe('hasAuthPayload', () => {
  it('claims links that carry a session or a failure', () => {
    expect(hasAuthPayload(parseAuthFragment('#access_token=a&type=recovery'))).toBe(true);
    expect(hasAuthPayload(parseAuthFragment('#error_code=otp_expired'))).toBe(true);
  });

  it('ignores ordinary deep links', () => {
    // A share link or a push-notification target must fall straight through.
    expect(hasAuthPayload(parseAuthFragment('edgewise:///trades/42'))).toBe(false);
    expect(hasAuthPayload(EmptyAuthLink)).toBe(false);
  });
});

describe('describeAuthLinkError', () => {
  it('names expiry as expiry, from the code or the description', () => {
    expect(describeAuthLinkError(parseAuthFragment('#error_code=otp_expired'))).toMatch(/expired/i);
    expect(
      describeAuthLinkError(
        parseAuthFragment('#error=access_denied&error_description=Email+link+has+expired'),
      ),
    ).toMatch(/expired/i);
  });

  it('distinguishes an already-used link from an expired one', () => {
    expect(describeAuthLinkError(parseAuthFragment('#error=access_denied'))).toMatch(
      /already been used/i,
    );
  });

  it('falls back to Supabase’s own sentence rather than inventing one', () => {
    expect(
      describeAuthLinkError(parseAuthFragment('#error=weird&error_description=Something+specific')),
    ).toBe('Something specific');
  });

  it('always tells the reader what to do next', () => {
    // Every branch has to end in an instruction — a dead link with no next step
    // is where people give up.
    const cases = [
      '#error_code=otp_expired',
      '#error=access_denied',
      '#error_code=over_email_send_rate_limit',
      '#error=mystery',
    ];

    for (const fragment of cases) {
      expect(describeAuthLinkError(parseAuthFragment(fragment))).toMatch(/request a new one|try again/i);
    }
  });
});
