import { View, type ViewProps } from 'react-native';

import type { ColorTokens } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A View with a themed background.
 *
 * `surface` names one of the surface tokens rather than a literal colour, so a
 * card is a card in both schemes.
 *
 * The previous version accepted `lightColor` and `darkColor` props and then
 * ignored both — they were never read, so any call passing them silently got the
 * default background. They are gone rather than implemented: per-call colour
 * overrides are what the token layer exists to prevent.
 */
export type Surface = Extract<
  keyof ColorTokens,
  'bg' | 'bgSunken' | 'surface' | 'surfaceRaised' | 'surfaceActive' | 'hero'
>;

export type ThemedViewProps = ViewProps & {
  surface?: Surface;
};

export function ThemedView({ style, surface = 'bg', ...rest }: ThemedViewProps) {
  const theme = useTheme();

  return <View style={[{ backgroundColor: theme.color[surface] }, style]} {...rest} />;
}
