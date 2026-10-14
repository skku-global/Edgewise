import { Themes, type Theme } from '@/constants/theme';

/** The app is dark only. */
export function useTheme(): Theme {
  return Themes.dark;
}
