import { Themes, type Theme } from '@/constants/theme';

/** The app is light only. */
export function useTheme(): Theme {
  return Themes.light;
}
