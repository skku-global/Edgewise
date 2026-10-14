/**
 * Card and section header.
 *
 * Flat: surfaces separate by lightness step against the page, with a
 * near-invisible hairline. No shadow.
 */

import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/styles';

export type CardProps = ViewProps & {
  /** Removes the inner padding, for a card whose child draws to the edge. */
  flush?: boolean;
};

export function Card({ style, flush = false, ...rest }: CardProps) {
  const styles = useThemedStyles(sheet);

  return <View style={[styles.card, !flush && styles.padded, style]} {...rest} />;
}

export type SectionProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SectionHeader({ title, subtitle, action, style }: SectionProps) {
  const styles = useThemedStyles(sheet);

  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionText}>
        <ThemedText variant="label" tone="textSecondary">
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText variant="caption" tone="textTertiary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/** Hairline divider for use between rows inside one card. */
export function Divider() {
  const styles = useThemedStyles(sheet);

  return <View style={styles.divider} />;
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.border,
    },
    padded: {
      padding: t.space.three,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: t.space.three,
      marginBottom: t.space.two,
    },
    sectionText: {
      gap: t.space.half,
      flexShrink: 1,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.color.border,
      marginHorizontal: -t.space.three,
    },
  });
