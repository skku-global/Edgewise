/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/develop/user-interface/color-themes/
 */

import { Themes, type Theme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The active theme — tokens, elevation, type scale, spacing.
 *
 * Returns one of two module-level constants, so the identity is stable per
 * scheme. `useThemedStyles` relies on that to cache stylesheets.
 *
 * `useColorScheme` is the project's own wrapper, not React Native's: on web it
 * reports `light` until hydration, because a static render has no way to know the
 * visitor's preference and guessing produces a flash of the wrong scheme.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme();

  return Themes[scheme ?? 'light'];
}
