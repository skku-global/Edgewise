/**
 * The probe's whole job is one distinction: something answered, or nothing did.
 * These tests pin that boundary, because both ways of getting it wrong are bad in
 * ways that are hard to notice — a false "unreachable" accuses the user's own
 * Supabase project of being deleted, and a false "reachable" puts the silent
 * sign-in screen back.
 */

import { isBackendReachable } from '@/lib/backend-reachable';

const base = 'https://nqwtetjrzoaggaerriew.supabase.co';

describe('isBackendReachable', () => {
  it('probes the auth health route on the configured host', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 200 });

    await isBackendReachable(base, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${base}/auth/v1/health`);
  });

  it('does not let a cached answer stand in for a live one', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 200 });

    await isBackendReachable(base, { fetchImpl: fetchImpl as unknown as typeof fetch });

    const init = fetchImpl.mock.calls[0][1];
    expect(init.cache).toBe('no-store');
    // Opaque on purpose: under `cors`, a response missing the headers is turned
    // into a throw, which would read here as an outage.
    expect(init.mode).toBe('no-cors');
    expect(init.method).toBe('GET');
  });

  // The bar is "anything answered", so every one of these is reachable. A status
  // code is the server talking, which is the only question being asked.
  it.each([200, 301, 400, 401, 404, 429, 500, 503])('treats HTTP %i as reachable', async (status) => {
    const fetchImpl = jest.fn().mockResolvedValue({ status });

    await expect(
      isBackendReachable(base, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe(true);
  });

  // Every wording a thrown fetch arrives with. The cause is the same each time:
  // the request never got anywhere.
  it.each([
    'Failed to fetch',
    'Network request failed',
    'NetworkError when attempting to fetch resource.',
    'Load failed',
    'getaddrinfo ENOTFOUND nqwtetjrzoaggaerriew.supabase.co',
  ])('treats a thrown fetch (%s) as unreachable', async (message) => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError(message));

    await expect(
      isBackendReachable(base, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe(false);
  });

  it('gives up when nothing arrives before the timeout', async () => {
    // Never settles on its own; only the abort ends it, which is the black-hole
    // network the timeout exists for.
    const fetchImpl = jest.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    await expect(
      isBackendReachable(base, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 1,
      }),
    ).resolves.toBe(false);
  });

  it('passes an abort signal, so a hung probe can be cut off', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 200 });

    await isBackendReachable(base, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  // The two "we cannot tell" cases. Both report reachable, because the honest
  // answer is unknown and of the two ways to be wrong, withholding a real
  // message beats accusing a working project of being deleted.
  it('reports reachable when there is no fetch to probe with', async () => {
    const original = globalThis.fetch;

    try {
      // @ts-expect-error removing it is the condition under test
      delete globalThis.fetch;
      await expect(isBackendReachable(base)).resolves.toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('reports reachable when the base URL is unparseable', async () => {
    const fetchImpl = jest.fn();

    await expect(
      isBackendReachable('not a url at all', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
