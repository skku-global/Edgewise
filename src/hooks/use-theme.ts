import { Themes, type Theme } from '@/constants/theme';
import { useDesignMode } from '@/design/mode';

/** The dark design uses the dark theme, the white design uses the light one. */
export function useTheme(): Theme {
  const { mode } = useDesignMode();
  return mode === 'dark' ? Themes.dark : Themes.light;
}
