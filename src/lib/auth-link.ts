/**
 * Reading Supabase's email links.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * Every Supabase auth email — confirmation, password recovery, invite, email
 * change — sends the user to `{project}/auth/v1/verify`, which redirects to our
 * app with the outcome attached. In the implicit flow (the supabase-js default,
 * and what this project uses) that outcome lives in the URL **fragment**:
 *
 *   edgewise:///reset-password#access_token=ey…&refresh_token=…&type=recovery
 *   http://localhost:8081/reset-password#error=access_denied&error_code=otp_expired
 *
 * On web, supabase-js reads that fragment itself (`detectSessionInUrl`) and we
 * only need to know *which kind* of link it was, so the app can send a recovery
 * user to the new-password screen instead of straight into the dashboard.
 *
 * On native `detectSessionInUrl` is off — there is no `window.location` to read
 * — so the fragment has to be parsed here and handed to `setSession` by hand.
 *
 * `Linking.parse()` cannot do this job: it returns scheme, hostname, path and
 * **query params**, and the payload we need is in the fragment.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS HAND-ROLLED
 * ---------------------------------------------------------------------------
 * No `URL` or `URLSearchParams`. Both exist on web and both exist on native only
 * because `react-native-url-polyfill` is required at the top of lib/supabase.ts
 * — and this module is imported *by* that file's consumers, so depending on that
 * import having already run would be a load-order trap. Twenty lines of split
 * and decode has no such ordering requirement and is trivially testable.
 *
 * The decode is deliberately failure-tolerant. A truncated link — someone
 * copying it out of an email client that wrapped the line — leaves a dangling
 * `%` that makes `decodeURIComponent` throw. Thrown from here it would take out
 * the session provider on the frame it mounts, turning a bad link into a blank
 * app. So a malformed value is passed through raw and the screen shows "that
 * link could not be used", which is both true and recoverable.
 */

/** Everything an auth email link can carry. Absent parts are null. */
export type AuthLink = {
  accessToken: string | null;
  refreshToken: string | null;
  /** `recovery`, `signup`, `invite`, `magiclink`, `email_change`. */
  type: string | null;
  /** Supabase's error slug, e.g. `access_denied`. */
  error: string | null;
  /** The specific reason, e.g. `otp_expired`. More useful than `error`. */
  errorCode: string | null;
  /** Supabase's own sentence, already URL-decoded. */
  errorDescription: string | null;
};

export const EmptyAuthLink: AuthLink = {
  accessToken: null,
  refreshToken: null,
  type: null,
  error: null,
  errorCode: null,
  errorDescription: null,
};

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Malformed percent-encoding. The raw text is more use than a crash.
    return value;
  }
}

function paramsOf(segment: string): Record<string, string> {
  const found: Record<string, string> = {};

  for (const pair of segment.split('&')) {
    if (!pair) continue;

    const split = pair.indexOf('=');
    const key = safeDecode(split === -1 ? pair : pair.slice(0, split));
    if (!key) continue;

    const raw = split === -1 ? '' : pair.slice(split + 1);
    // `+` means space in a form-encoded segment, which is how Supabase encodes
    // `error_description`. decodeURIComponent leaves it alone.
    found[key] = safeDecode(raw.replace(/\+/g, ' '));
  }

  return found;
}

/**
 * Accepts a full URL, a bare `#fragment`, or the fragment's contents alone
 * (which is what `window.location.hash` gives once the `#` is dropped).
 *
 * Both the fragment and the query string are read, with the fragment winning.
 * The implicit flow puts everything in the fragment, but Supabase's `verify`
 * endpoint can bounce an error back on the query string instead, and a link that
 * failed in a way we cannot describe is the one case where a vague message does
 * real damage.
 */
export function parseAuthFragment(input: string | null | undefined): AuthLink {
  if (!input) {
    return EmptyAuthLink;
  }

  let fragment = '';
  let query = '';

  const hash = input.indexOf('#');

  if (hash !== -1) {
    fragment = input.slice(hash + 1);
    const before = input.slice(0, hash);
    const mark = before.indexOf('?');
    query = mark === -1 ? '' : before.slice(mark + 1);
  } else {
    const mark = input.indexOf('?');

    if (mark !== -1) {
      query = input.slice(mark + 1);
    } else if (!input.includes('://') && !input.startsWith('/')) {
      // No '#', no '?', not a URL: the caller handed over fragment contents.
      fragment = input;
    }
  }

  const values = { ...paramsOf(query), ...paramsOf(fragment) };
  const read = (key: string) => (values[key] ? values[key] : null);

  return {
    accessToken: read('access_token'),
    refreshToken: read('refresh_token'),
    type: read('type'),
    error: read('error'),
    errorCode: read('error_code'),
    errorDescription: read('error_description'),
  };
}

/**
 * Whether this link is one of ours. Ordinary deep links — a share URL, a push
 * notification — must fall through untouched rather than being treated as a
 * failed sign-in.
 */
export function hasAuthPayload(link: AuthLink): boolean {
  return !!(link.accessToken || link.error || link.errorCode);
}

/**
 * Why the link did not work, in a sentence the person holding it can act on.
 *
 * Every branch ends by pointing at the next step, because a dead link with no
 * instruction is where people give up. Supabase's own `error_description` is
 * the fallback rather than the first choice: it is accurate but written for
 * whoever integrated the API ("Email link is invalid or has expired").
 */
export function describeAuthLinkError(link: AuthLink): string {
  const code = (link.errorCode ?? '').toLowerCase();
  const description = (link.errorDescription ?? '').toLowerCase();

  if (code === 'otp_expired' || description.includes('expired')) {
    return 'That link has expired. Links are only good for a short while — request a new one.';
  }
  if (code === 'access_denied' || link.error === 'access_denied') {
    return 'That link has already been used. Request a new one.';
  }
  if (code.includes('rate') || description.includes('rate limit')) {
    return 'Too many emails requested. Wait a few minutes, then try again.';
  }

  return link.errorDescription ?? 'That link could not be used. Request a new one.';
}
