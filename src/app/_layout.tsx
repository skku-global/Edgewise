/**
 * Root layout: the auth boundary and the theme boundary, nothing else.
 *
 * ---------------------------------------------------------------------------
 * WHY `Stack.Protected` AND NOT A REDIRECT EFFECT
 * ---------------------------------------------------------------------------
 * This used to read the session, render `<Slot />` regardless, and then call
 * `router.replace('/login')` from an effect. Effects run after paint, so a deep
 * link into a signed-out app rendered a screen full of someone's trades — one
 * frame of it, but a real frame — before the redirect landed. It also meant
 * `segments` had to be inspected by hand to avoid a redirect loop on /login
 * itself.
 *
 * `Stack.Protected` moves the decision into the navigator: a screen behind a
 * false guard is not in the stack at all, so there is no frame to leak and no
 * loop to guard against. Signing out needs no navigation call either — the guard
 * flips and the navigator moves the user back to /login on its own.
 *
 * `RootNavigator` is a separate component because it has to consume the context
 * that `SessionProvider` provides; a hook cannot read a provider its own
 * component renders.
 */

import { ThemeProvider, type Theme as NavigationTheme } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { SplashOverlay } from '@/components/splash-overlay';
import { Fonts, Themes, type ColorScheme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SessionProvider, useSession } from '@/lib/session';

// Kept up until the session has been read, so the app never flashes a
// signed-out screen at someone who is signed in.
SplashScreen.preventAutoHideAsync();

/**
 * React Navigation keeps its own colour object for the bits it draws itself —
 * the screen background behind a transition, the header, the back-button tint.
 * Deriving it from the same tokens is what stops a white flash between two dark
 * screens.
 */
const navigationThemes: Record<ColorScheme, NavigationTheme> = {
  light: buildNavigationTheme('light'),
  dark: buildNavigationTheme('dark'),
};

function buildNavigationTheme(scheme: ColorScheme): NavigationTheme {
  const { color } = Themes[scheme];

  return {
    dark: scheme === 'dark',
    colors: {
      primary: color.accent,
      background: color.bg,
      card: color.surface,
      text: color.text,
      border: color.border,
      notification: color.loss,
    },
    fonts: {
      regular: { fontFamily: Fonts.sans, fontWeight: '400' },
      medium: { fontFamily: Fonts.sans, fontWeight: '500' },
      bold: { fontFamily: Fonts.sans, fontWeight: '600' },
      heavy: { fontFamily: Fonts.sans, fontWeight: '700' },
    },
  };
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}

function RootNavigator() {
  const { session, isLoading } = useSession();
  const theme = useTheme();

  return (
    <ThemeProvider value={navigationThemes[theme.scheme]}>
      {/* `light` content: both schemes put a dark hero band behind the status
          bar, so dark glyphs would disappear into it. */}
      <StatusBar style="light" />

      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.color.bg },
        }}
      >
        {/* Both guards read `!isLoading` so neither group mounts before the
            stored session has been read. Without it the login screen would
            mount on every cold start and then be swapped out, which is the
            flash this whole arrangement exists to remove. */}
        <Stack.Protected guard={!isLoading && !!session}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>

        <Stack.Protected guard={!isLoading && !session}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>

      <SplashOverlay visible={isLoading} />
    </ThemeProvider>
  );
}
