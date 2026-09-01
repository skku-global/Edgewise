/**
 * The refresh storm, and the two ways the fix for it silently rots.
 *
 * Neither failure is visible: a ticker that quietly restarts puts the storm back
 * with nobody the wiser, and a ticker that never restarts means no token in the
 * app refreshes again for the rest of the session. Both look like nothing at all
 * from the outside, so they are pinned here.
 */

import { AppState } from 'react-native';
import { act, create } from 'react-test-renderer';

import { isBackendReachable } from '@/lib/backend-reachable';
import { SessionProvider } from '@/lib/session';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  SUPABASE_URL: 'https://nqwtetjrzoaggaerriew.supabase.co',
  initialAuthHash: '',
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      stopAutoRefresh: jest.fn(),
      startAutoRefresh: jest.fn(),
      setSession: jest.fn(),
    },
  },
}));

jest.mock('@/lib/backend-reachable', () => ({ isBackendReachable: jest.fn() }));

jest.mock('expo-linking', () => ({
  useLinkingURL: () => null,
  createURL: (path: string) => `edgewise://${path}`,
}));

const auth = supabase.auth as unknown as {
  getSession: jest.Mock;
  onAuthStateChange: jest.Mock;
  stopAutoRefresh: jest.Mock;
  startAutoRefresh: jest.Mock;
};
const probe = isBackendReachable as jest.Mock;

/** Captured so a test can push the app into the foreground itself. */
let appStateListeners: ((state: string) => void)[] = [];

/** Unmounted after every test: a live tree keeps its re-assert interval ticking. */
let mounted: ReturnType<typeof create>[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  appStateListeners = [];
  mounted = [];

  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: jest.fn() } },
  });
  auth.stopAutoRefresh.mockResolvedValue(undefined);
  auth.startAutoRefresh.mockResolvedValue(undefined);

  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    cb: (state: string) => void,
  ) => {
    appStateListeners.push(cb);
    return { remove: jest.fn() };
  }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => {
  for (const tree of mounted) {
    act(() => {
      tree.unmount();
    });
  }

  jest.restoreAllMocks();
});

async function mount() {
  let tree: ReturnType<typeof create> | undefined;

  await act(async () => {
    tree = create(<SessionProvider>{null}</SessionProvider>);
  });

  mounted.push(tree!);

  return tree!;
}

describe('SessionProvider — unreachable backend', () => {
  it('stops the refresh ticker when nothing answers', async () => {
    probe.mockResolvedValue(false);

    await mount();

    expect(auth.stopAutoRefresh).toHaveBeenCalled();
  });

  it('leaves the ticker alone when the backend answers', async () => {
    probe.mockResolvedValue(true);

    await mount();

    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
  });

  // supabase-js restarts the ticker from its own visibilitychange handler, so one
  // stop lasts only until the first tab switch. If this assertion ever fails the
  // storm is back and nothing else will say so.
  it('keeps re-asserting the stop, because the library restarts it', async () => {
    jest.useFakeTimers();

    try {
      probe.mockResolvedValue(false);

      await mount();

      const afterMount = auth.stopAutoRefresh.mock.calls.length;
      expect(afterMount).toBeGreaterThan(0);

      await act(async () => {
        jest.advanceTimersByTime(20_000);
      });

      expect(auth.stopAutoRefresh.mock.calls.length).toBeGreaterThan(afterMount);
    } finally {
      jest.useRealTimers();
    }
  });

  it('re-probes when the app comes back to the foreground', async () => {
    probe.mockResolvedValue(false);

    await mount();

    expect(appStateListeners).toHaveLength(1);
    const callsBefore = probe.mock.calls.length;

    // Still down. Nothing should be handed back yet.
    await act(async () => {
      appStateListeners[0]('active');
    });

    expect(probe.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
  });

  it('hands the ticker back once the backend answers again', async () => {
    probe.mockResolvedValue(false);

    await mount();

    // The project came back while the tab was in the background.
    probe.mockResolvedValue(true);

    await act(async () => {
      appStateListeners[0]('active');
    });

    // Cleared, which tears the effect down — and the teardown is what restarts
    // the ticker. Without it nothing would refresh a token again.
    expect(auth.startAutoRefresh).toHaveBeenCalled();
    // Re-read so supabase-js either refreshes cleanly or signs the user out.
    expect(auth.getSession.mock.calls.length).toBeGreaterThan(1);
  });

  it('ignores the app going to the background', async () => {
    probe.mockResolvedValue(false);

    await mount();

    const callsBefore = probe.mock.calls.length;

    await act(async () => {
      appStateListeners[0]('background');
    });

    expect(probe.mock.calls.length).toBe(callsBefore);
  });
});
