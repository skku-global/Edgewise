import { Text, type TextProps } from 'react-native';

import type { ColorTokens, TypeToken } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Text on the type scale.
 *
 * `variant` picks a step from `Type` in constants/theme; `tone` picks a colour
 * token. Both are semantic, so the same call renders correctly in either scheme —
 * which the previous version could not do, since it carried a hardcoded
 * `#3c87f7` for links and a set of one-off font sizes with no relationship to
 * each other.
 */
export type TextTone = Extract<
  keyof ColorTokens,
  | 'text'
  | 'textSecondary'
  | 'textTertiary'
  | 'textOnFill'
  | 'accentText'
  | 'gain'
  | 'loss'
  | 'heroText'
  | 'heroMuted'
>;

export type ThemedTextProps = TextProps & {
  variant?: TypeToken;
  tone?: TextTone;
};

export function ThemedText({
  style,
  variant = 'body',
  tone = 'text',
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();

  return (
    // `style` last, so a caller's own style still wins over the variant.
    <Text style={[theme.type[variant], { color: theme.color[tone] }, style]} {...rest} />
  );
}
