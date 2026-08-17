/**
 * Auth session, shared.
 *
 * Every `supabase.auth` call in the app lives here. Screens get `session`,
 * `user` and three verbs; they never touch the auth client directly. That is
 * what makes a sign-out button possible from anywhere, and it means the token
 * refresh and the sign-in error mapping exist once instead of per screen.
 *
 * Persistence is already handled: `supabase.auth` is configured with
 * AsyncStorage on native and localStorage on web (see lib/supabase.ts), so
 * `getSession()` resolves from disk on a cold start and `onAuthStateChange`
 * reports the refreshes that follow.
 */

import type { AuthError, Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, use, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/** What a verb returns: a human-readable problem, or null on success. */
export type AuthResult = { error: string | null; message?: string };

type SessionValue = {
  session: Session | null;
  user: User | null;
  /** True until the stored session has been read. Nothing should redirect yet. */
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (input: SignUpInput) => Promise<AuthResult>;
  signOut: () => Promise<void>;
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
 * Supabase error messages are written for developers. These are the four a user
 * can actually hit, rephrased into something they can act on; anything else
 * falls through to the original text rather than being flattened into a useless
 * "something went wrong".
 */
function describe(error: AuthError): string {
  const status = error.status ?? 0;
  const raw = error.message.toLowerCase();

  if (status === 429 || raw.includes('rate limit')) {
    return 'Too many attempts. Wait a couple of minutes and try again.';
  }
  if (raw.includes('invalid login credentials')) {
    return 'That email and password combination does not match an account.';
  }
  if (raw.includes('email not confirmed')) {
    return 'Confirm your email address first — check your inbox for the link.';
  }
  if (raw.includes('already registered') || raw.includes('already been registered')) {
    return 'An account already exists for that email. Sign in instead.';
  }

  return error.message;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setIsLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    return { error: error ? describe(error) : null };
  }, []);

  const signUp = useCallback(
    async ({ email, password, firstName, lastName }: SignUpInput): Promise<AuthResult> => {
      // Where the confirmation link comes back to. On web that is the page the
      // user is standing on; on native it is the app's own scheme, which is why
      // `scheme` in app.json has to stay in sync with the Supabase redirect
      // allow-list.
      const emailRedirectTo =
        Platform.OS === 'web' ? window.location.origin : Linking.createURL('/');

      const first = firstName.trim();
      const last = lastName.trim();

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo,
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

      return { error: null, message: 'Check your email for the confirmation link.' };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // No navigation call: `Stack.Protected` in the root layout sees the guard
    // flip and moves the user itself.
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ session, user: session?.user ?? null, isLoading, signIn, signUp, signOut }),
    [session, isLoading, signIn, signUp, signOut],
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
