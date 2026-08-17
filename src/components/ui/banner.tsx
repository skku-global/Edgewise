/**
 * The message strip that sits above a form.
 *
 * Three tones, and the distinction matters more than it looks:
 *
 *   error   — the thing you asked for did not happen.
 *   notice  — it happened, but you are not finished; go and do something else
 *             (check your inbox, usually).
 *   success — it happened and there is nothing left to do.
 *
 * Colour alone does not carry that, so each tone also gets its own icon: red and
 * green are the two most commonly confused pairs in colour-vision deficiency,
 * and they are exactly the two this component uses.
 *
 * `action` is here because the auth flows almost always have a next step to
 * offer alongside the message — resend the email, request a fresh link — and a
 * button placed inside the banner keeps the remedy attached to the problem
 * instead of stranded at the bottom of the card.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText, type TextTone } from '@/components/themed-text';
import type { Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemedStyles } from '@/lib/styles';

export type BannerTone = 'error' | 'notice' | 'success';

export type BannerProps = {
  tone?: BannerTone;
  message: string;
  /** A button, usually. Rendered under the message, aligned to the start. */
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

const icons: Record<BannerTone, React.ComponentProps<typeof Ionicons>['name']> = {
  error: 'alert-circle',
  notice: 'mail-outline',
  success: 'checkmark-circle',
};

const tones: Record<BannerTone, TextTone> = {
  error: 'loss',
  notice: 'accentText',
  success: 'gain',
};

export function Banner({ tone = 'notice', message, action, style }: BannerProps) {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);

  return (
    <View
      // Announced when it appears, without stealing focus from the field the
      // person is still working in. `alert` is the only assertive role React
      // Native maps on both platforms — the live region is what carries the
      // other two tones, which do not warrant interrupting anyone.
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.banner, styles[tone], style]}
    >
      <View style={styles.row}>
        <Ionicons name={icons[tone]} size={18} color={theme.color[tones[tone]]} />
        <ThemedText variant="caption" tone={tones[tone]} style={styles.text}>
          {message}
        </ThemedText>
      </View>

      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    banner: {
      gap: t.space.two,
      padding: t.space.three,
      borderRadius: t.radius.md,
    },
    row: {
      flexDirection: 'row',
      // Top, not centre: the message wraps to several lines and a centred icon
      // would drift into the middle of the paragraph.
      alignItems: 'flex-start',
      gap: t.space.two,
    },
    text: {
      flex: 1,
    },
    action: {
      // Lines up with the text above rather than the icon, and stays at its
      // natural width instead of stretching across the strip.
      alignItems: 'flex-start',
      paddingLeft: 18 + t.space.two,
    },
    error: {
      backgroundColor: t.color.lossSoft,
    },
    notice: {
      backgroundColor: t.color.accentSoft,
    },
    success: {
      backgroundColor: t.color.gainSoft,
    },
  });
