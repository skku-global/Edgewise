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
import { Platform } from 'react-native';

import { describeAuthLinkError, hasAuthPayload, parseAuthFragment } from '@/lib/auth-link';
import { initialAuthHash, supabase } from '@/lib/supabase';

/** What a verb returns: a human-readable problem, or null on success. */
export type AuthResult = { error: string | null; message?: string };

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
 * Supabase error messages are written for developers. These are the ones a user
 * can actually hit, rephrased into something they can act on; anything else
 * falls through to the original text rather than being flattened into a useless
 * "something went wrong".
 */
function describe(error: AuthError): string {
  const status = error.status ?? 0;
  const raw = error.message.toLowerCase();

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

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecovering, setIsRecovering] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }
      setSession(data.session);
      setIsLoading(false);
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
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

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
