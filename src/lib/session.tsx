/**
 * Auth session, shared.
 *
 * Every `supabase.auth` call in the app lives here. Screens get `session`,
 * `user` and the verbs; they never touch the auth client directly. That is what
 * makes a sign-out button possible from anywhere, and it means the token refresh
 * and the error mapping exist once instead of per screen.
 *
 * Persistence is already handled: `supabase.auth` is configured with
 * AsyncStorage on native and localStorage on web (see lib/supabase.ts), so
 * `getSession()` resolves from disk on a cold start and `onAuthStateChange`
 * reports the refreshes that follow.
 *
 * ---------------------------------------------------------------------------
 * PASSWORD RECOVERY, AND WHY IT NEEDS ITS OWN FLAG
 * ---------------------------------------------------------------------------
 * A recovery link does not open a "reset password" mode — it opens a real,
 * fully-privileged session. Left alone, clicking "forgot my password" in an
 * email drops the user straight into the dashboard with the old password still
 * set, which is both confusing and the opposite of what they asked for.
 *
 * `isRecovering` is what stops that. The root layout gates the app group on
 * `!isRecovering`, so a recovery session can only reach the new-password screen.
 * It clears when that screen is done with it, or on sign-out.
 *
 * The flag is set from two places on purpose. On web the fragment snapshot is
 * the primary signal because it is synchronous and deterministic; the
 * `PASSWORD_RECOVERY` event is a second chance in case supabase-js resolves the
 * link on a path the snapshot missed. Setting it twice is harmless; missing it
 * once means a user who asked to reset their password silently does not get to.
 */

import type { AuthError, Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, Platform } from 'react-native';

import {
  describeAuthError,
  describeUnreachableBackend,
  isUnreachableAuthError,
  UnconfirmedEmailError,
} from '@/lib/auth-errors';
import { isBackendReachable } from '@/lib/backend-reachable';
import { describeAuthLinkError, hasAuthPayload, parseAuthFragment } from '@/lib/auth-link';
import { SUPABASE_URL, initialAuthHash, supabase } from '@/lib/supabase';

/** What a verb returns: a human-readable problem, or null on success. */
export type AuthResult = { error: string | null; message?: string };

/**
 * Re-exported so screens keep importing it from the provider they already use.
 * It is defined next to the mapping that produces it, in `lib/auth-errors.ts`.
 */
export { UnconfirmedEmailError };

/**
 * Host this client is pointed at, named in the unreachable-backend message.
 *
 * `createClient` has already accepted the URL by the time this module loads, so
 * the parse is expected to succeed; the fallback is here so a malformed value
 * degrades to a vaguer message rather than throwing while building one.
 */
const backendHost = (() => {
  try {
    return new URL(SUPABASE_URL).host;
  } catch {
    return undefined;
  }
})();

/**
 * How often the stopped ticker is re-asserted while the backend is unreachable.
 *
 * Not a poll: this fires no request and prints nothing. It exists because
 * `stopAutoRefresh()` does not stay stopped — supabase-js calls
 * `_startAutoRefresh()` itself from its own `visibilitychange` handler every time
 * the tab becomes visible, so a single stop survives only until the first tab
 * switch. Comfortably under the library's own 30s tick so a restarted ticker is
 * caught before it fires.
 */
const ReassertStoppedRefreshMs = 20_000;

type SessionValue = {
  session: Session | null;
  user: User | null;
  /** True until the stored session has been read. Nothing should redirect yet. */
  isLoading: boolean;
  /**
   * A password-recovery link is open. The app group is closed while this is
   * true — see the note at the top of this file.
   */
  isRecovering: boolean;
  /**
   * An email link was rejected: expired, already used, or tampered with. Set
   * once when the link is read, and displayed by whichever screen the guards
   * land on, so a dead link never fails silently.
   */
  linkError: string | null;
  clearLinkError: () => void;
  /**
   * Nothing is answering at the backend's address.
   *
   * Separate from `linkError` because it is a different kind of fact. A link
   * error is about one thing the user just did and is dismissible; this is the
   * whole app being unable to function, it is nobody's mistake, and there is no
   * version of dismissing it that helps — hiding it would leave a sign-in screen
   * that fails for no stated reason, which is exactly what this replaced.
   *
   * Set on mount, and only while signed out: the screens that display it are the
   * auth screens. Someone holding a still-valid stored token is on their way
   * into the app instead, where a dead backend surfaces as failing reads.
   */
  backendError: string | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (input: SignUpInput) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  /** Sends the password-reset email. */
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  /** Sets a new password on the current session — recovery or otherwise. */
  updatePassword: (password: string) => Promise<AuthResult>;
  /** Sends the sign-up confirmation email again. */
  resendConfirmation: (email: string) => Promise<AuthResult>;
  /** Leaves recovery mode, releasing the user into the app. */
  endRecovery: () => void;
};

export type SignUpInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = use(SessionContext);

  if (!value) {
    throw new Error('useSession must be used inside <SessionProvider>');
  }

  return value;
}

/**
 * Where an email link should come back to.
 *
 * On web that is a path on the origin the user is standing on; on native it is
 * the app's own scheme, which is why `scheme` in app.json has to stay in sync
 * with the Supabase redirect allow-list. Anything not on that allow-list is
 * silently replaced by the project's Site URL, which is the single most common
 * reason a link "works" but lands somewhere useless — see mt5/README.md and the
 * setup notes in scripts/.
 */
function linkBackTo(path: string): string {
  if (Platform.OS === 'web') {
    return `${window.location.origin}${path}`;
  }

  return Linking.createURL(path);
}

/**
 * Maps a Supabase auth error to what a screen shows.
 *
 * The mapping itself is `lib/auth-errors.ts`. This wrapper exists only to bind
 * the host, so the unreachable-backend case can name what it failed to reach —
 * bound once here rather than threaded through every call site below.
 */
function describe(error: AuthError): string {
  return describeAuthError(error, backendHost);
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecovering, setIsRecovering] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) {
        return;
      }
      setSession(data.session);
      setIsLoading(false);

      // A stored token that expired *and* could not be refreshed. supabase-js
      // made a real request here, so its verdict beats a probe of our own.
      if (error && isUnreachableAuthError(error)) {
        setBackendError(describeUnreachableBackend(backendHost));
        return;
      }

      // Signed in from storage. Not proof the backend is up — a token inside its
      // expiry window is returned without any request — but this user is headed
      // for the app, not for a screen that shows this message.
      if (data.session) {
        return;
      }

      // Signed out, and nothing above touched the network. Without this the
      // sign-in screen looks completely normal until someone submits it.
      isBackendReachable(SUPABASE_URL).then((reachable) => {
        if (!active || reachable) {
          return;
        }
        setBackendError(describeUnreachableBackend(backendHost));
      });
    });

    // Fires for sign-in, sign-out, token refresh and the email-link handoff on
    // web, so this is the only place session state needs to be written.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setIsLoading(false);

      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovering(true);
      }
      if (event === 'SIGNED_OUT') {
        setIsRecovering(false);
      }
      // Neither of these can happen without the server answering, so an earlier
      // verdict that it was unreachable is now provably stale. Deliberately not
      // INITIAL_SESSION, which is satisfied from storage and proves nothing.
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setBackendError(null);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  /**
   * While the backend is unreachable, stop trying to refresh against it.
   *
   * -------------------------------------------------------------------------
   * WHAT THE CONSOLE STORM ACTUALLY IS
   * -------------------------------------------------------------------------
   * supabase-js does not clear a stored session when a refresh fails
   * *retryably*, and a dead hostname is retryable by its reckoning. So the
   * stale token stays on disk and gets attempted forever. Each attempt is not
   * one request either: `_refreshAccessToken` wraps the call in exponential
   * backoff — 200ms, 400, 800, 1600, … — and keeps going while the next delay
   * still fits inside the 30s tick, which is roughly eight requests per burst.
   * A 30s ticker then does it again, and again.
   *
   * None of that retrying can succeed. A hostname that does not resolve does
   * not resolve harder on the ninth attempt, so the whole exercise buys nothing
   * and costs a console no one can read past.
   *
   * -------------------------------------------------------------------------
   * WHAT IS AND IS NOT FIXABLE FROM OUT HERE
   * -------------------------------------------------------------------------
   * The first burst is not. `_recoverAndRefresh()` runs from the client's own
   * `_initialize()`, before any of this mounts, and a tab focus triggers another
   * — both are the library restoring an expired session against a host that is
   * not answering, and neither is reachable from outside it. What is fixable is
   * the repetition, which is the part that never ends.
   *
   * Recovery is deliberately driven by the app becoming active rather than by a
   * timer. A timer would have to make a request to learn anything, which would
   * put back a slice of the noise this effect exists to remove — and returning
   * to the app is both the likelier moment for the backend to have come back
   * (the user just went and restored it) and the only moment anyone is there to
   * see the result. `AppState` covers both platforms: react-native-web maps it
   * onto document visibility.
   */
  useEffect(() => {
    if (!backendError) {
      return;
    }

    let active = true;

    void supabase.auth.stopAutoRefresh();

    const reassert = setInterval(() => {
      void supabase.auth.stopAutoRefresh();
    }, ReassertStoppedRefreshMs);

    const subscription = AppState.addEventListener('change', (state) => {
      if (!active || state !== 'active') {
        return;
      }

      isBackendReachable(SUPABASE_URL).then(async (reachable) => {
        if (!active || !reachable) {
          return;
        }

        // Answering again. Let supabase-js re-read the session — which either
        // refreshes cleanly, or fails non-retryably and signs the user out,
        // both of which are correct and neither of which is ours to decide.
        await supabase.auth.getSession();

        if (active) {
          setBackendError(null);
        }
      });
    });

    return () => {
      active = false;
      clearInterval(reassert);
      subscription.remove();

      // Whatever cleared the error — the probe above, or a sign-in that proved
      // the host answers — the ticker has to come back on. Leaving it stopped
      // would mean no token refreshed again for the rest of the session, which
      // is a far quieter bug than the one being fixed and a much worse one.
      void supabase.auth.startAutoRefresh();
    };
  }, [backendError]);

  /**
   * Web: read the fragment that was on the page at load.
   *
   * supabase-js has already turned it into a session by now (or failed to); all
   * that is needed here is the outcome — which kind of link it was, or why it
   * was refused.
   */
  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const link = parseAuthFragment(initialAuthHash);

    if (!hasAuthPayload(link)) {
      return;
    }

    if (link.error || link.errorCode) {
      setLinkError(describeAuthLinkError(link));
      return;
    }

    if (link.type === 'recovery' && link.accessToken) {
      setIsRecovering(true);
    }
  }, []);

  /**
   * Native: the link arrives as a deep link and nothing has read it.
   *
   * `useLinkingURL` is the SDK 54 hook — `useURL` is deprecated. It returns the
   * launch URL immediately on a cold start and then any later ones, so a link
   * tapped while the app is already open is covered by the same effect.
   */
  const incomingUrl = Linking.useLinkingURL();

  useEffect(() => {
    if (Platform.OS === 'web' || !incomingUrl) {
      return;
    }

    const link = parseAuthFragment(incomingUrl);

    if (!hasAuthPayload(link)) {
      return;
    }

    if (link.error || link.errorCode) {
      setLinkError(describeAuthLinkError(link));
      return;
    }

    if (!link.accessToken || !link.refreshToken) {
      return;
    }

    let active = true;

    supabase.auth
      .setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
      .then(({ error }) => {
        if (!active) {
          return;
        }
        if (error) {
          setLinkError(describe(error));
          return;
        }
        if (link.type === 'recovery') {
          setIsRecovering(true);
        }
      });

    return () => {
      active = false;
    };
  }, [incomingUrl]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    return { error: error ? describe(error) : null };
  }, []);

  const signUp = useCallback(
    async ({ email, password, firstName, lastName }: SignUpInput): Promise<AuthResult> => {
      const first = firstName.trim();
      const last = lastName.trim();

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: linkBackTo('/'),
          data: { first_name: first, last_name: last, full_name: `${first} ${last}` },
        },
      });

      if (error) {
        return { error: describe(error) };
      }

      // With email confirmation on, `session` is null and the user has to click
      // the link. With it off, Supabase signs them straight in and the guard in
      // the root layout takes over — so only tell them to check their inbox when
      // there is genuinely nothing else to do.
      if (data.session) {
        return { error: null };
      }

      return {
        error: null,
        message: `Account created. Check ${email.trim()} for the confirmation link, then sign in.`,
      };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // No navigation call: `Stack.Protected` in the root layout sees the guard
    // flip and moves the user itself.
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    const address = email.trim();

    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: linkBackTo('/reset-password'),
    });

    if (error) {
      return { error: describe(error) };
    }

    // Deliberately non-committal. Supabase returns success whether or not the
    // address has an account, precisely so this endpoint cannot be used to find
    // out who is registered — so promising that an email is on its way would be
    // a claim we cannot make. The copy matches what actually happened.
    return {
      error: null,
      message: `If an account exists for ${address}, a reset link is on its way. It expires within the hour.`,
    };
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.updateUser({ password });

    return { error: error ? describe(error) : null };
  }, []);

  const resendConfirmation = useCallback(async (email: string): Promise<AuthResult> => {
    const address = email.trim();

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: address,
      options: { emailRedirectTo: linkBackTo('/') },
    });

    if (error) {
      return { error: describe(error) };
    }

    return { error: null, message: `Sent again to ${address}. Check your spam folder too.` };
  }, []);

  const clearLinkError = useCallback(() => setLinkError(null), []);
  const endRecovery = useCallback(() => setIsRecovering(false), []);

  const value = useMemo<SessionValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isRecovering,
      linkError,
      clearLinkError,
      backendError,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      resendConfirmation,
      endRecovery,
    }),
    [
      session,
      isLoading,
      isRecovering,
      linkError,
      clearLinkError,
      backendError,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      resendConfirmation,
      endRecovery,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** First name, else the part of the email before the @. Never empty. */
export function displayName(user: User | null): string {
  const meta = user?.user_metadata ?? {};
  const first = typeof meta.first_name === 'string' ? meta.first_name.trim() : '';

  if (first) {
    return first;
  }

  const full = typeof meta.full_name === 'string' ? meta.full_name.trim() : '';

  if (full) {
    return full.split(' ')[0];
  }

  return user?.email?.split('@')[0] ?? 'Trader';
}

/** One or two letters for the account avatar. */
export function initials(user: User | null): string {
  const meta = user?.user_metadata ?? {};
  const first = typeof meta.first_name === 'string' ? meta.first_name.trim() : '';
  const last = typeof meta.last_name === 'string' ? meta.last_name.trim() : '';

  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
  }

  return (user?.email?.charAt(0) ?? 'E').toUpperCase();
}
