/**
 * Does anything answer at the backend's address?
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS WHEN supabase-js ALREADY REPORTS FETCH FAILURES
 * ---------------------------------------------------------------------------
 * It reports them only when it makes a request. On a cold load `getSession()`
 * reads storage first, and a visitor with no stored session — the common case for
 * anyone opening the deployed site for the first time — produces
 * `{ session: null, error: null }` with no network call at all. A visitor whose
 * stored access token has not yet expired is returned it from storage, also
 * without a request.
 *
 * So an unreachable backend is invisible until the user types a password and
 * presses the button. They then get told something that, until this probe
 * existed, was the only thing the app could say: nothing. This asks the question
 * directly instead, once, so the sign-in screen can explain itself before
 * anybody fills it in.
 *
 * ---------------------------------------------------------------------------
 * WHAT COUNTS AS REACHABLE
 * ---------------------------------------------------------------------------
 * Any answer. A 200, a 404, a 401, a 500 — every one of them proves the hostname
 * resolved and a server processed the request, which is the entire question being
 * asked. Only a `fetch` that *throws* means unreachable: DNS failure, no network,
 * a blocked request, or nothing arriving before the timeout.
 *
 * That is a deliberately low bar, and it has to be, because the alternative is
 * false alarms. A probe that insisted on a 200 would call a healthy project
 * broken the moment Supabase changed a status code, and this message accuses the
 * user's own project of being deleted — a wrong positive is expensive.
 *
 * `no-cors` is what makes the low bar achievable. Under the default `cors` mode a
 * response without the right headers is turned into a thrown `TypeError`,
 * indistinguishable from a dead hostname, so a CORS policy on the health route
 * would be reported to the user as an outage. `no-cors` returns an opaque
 * response instead. React Native ignores the option entirely; it does not enforce
 * CORS.
 *
 * And an opaque response is the reason nothing below inspects the result. It
 * reports `status: 0` and `ok: false` no matter how well the request went —
 * verified against a live host, which answers 0 exactly like a dead one would if
 * it answered at all. So `r.ok`, `r.status === 200`, or any other check on the
 * response would invert this function and report every backend on earth as
 * unreachable. Settling is the signal; the response is not.
 */

/** The auth health route: no body worth having, and no credentials needed. */
const probePath = '/auth/v1/health';

/**
 * Long enough that a slow phone on a bad connection is not accused of an outage,
 * short enough that the sign-in screen is not silently withholding an
 * explanation while someone stares at it. A DNS failure — the case this was
 * written for — rejects in milliseconds and never waits for this.
 */
const defaultTimeoutMs = 8000;

export type ReachabilityOptions = {
  /** Injectable for tests, which must not touch the network. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export async function isBackendReachable(
  baseUrl: string,
  { fetchImpl, timeoutMs = defaultTimeoutMs }: ReachabilityOptions = {},
): Promise<boolean> {
  const doFetch = fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);

  // No fetch to probe with. Report reachable rather than inventing an outage:
  // the honest answer is "unknown", and of the two ways to be wrong, hiding a
  // real message is better than showing a false accusation.
  if (!doFetch) {
    return true;
  }

  let url: string;

  try {
    url = new URL(probePath, baseUrl).toString();
  } catch {
    // A malformed base URL is a configuration fault, not an outage, and
    // `lib/supabase.ts` has already thrown on the empty case before this runs.
    return true;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await doFetch(url, {
      method: 'GET',
      mode: 'no-cors',
      // A cached answer would keep reporting a project that has since gone away.
      cache: 'no-store',
      signal: controller.signal,
    });

    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
