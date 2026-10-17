import { useContext } from 'react';

import { Themes, type Theme } from '@/constants/theme';
import { ForcedSchemeContext } from '@/design/force-scheme';
import { useDesignMode } from '@/design/mode';

/**
 * The dark design uses the dark theme, the white design uses the light one.
 * A screen wrapped in <ForceScheme> uses its own scheme in both designs.
 */
export function useTheme(): Theme {
  const { mode } = useDesignMode();
  const forced = useContext(ForcedSchemeContext);
  const scheme = forced ?? (mode === 'dark' ? 'dark' : 'light');
  return scheme === 'dark' ? Themes.dark : Themes.light;
}
