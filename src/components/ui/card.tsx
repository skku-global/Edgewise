/**
 * Card, and the section header that usually sits above one.
 *
 * A card is a hairline border plus a level-1 shadow — not a heavy drop shadow.
 * In light mode the border does the separating and the shadow only lifts; in
 * dark mode `surface` is lighter than `bg`, so the border is what keeps a row of
 * cards from merging into one block. Both are needed for the pair of schemes to
 * look like the same design.
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
  /** Small all-caps marker. */
  title: string;
  /** Optional line under it, for a unit or a caveat. */
  subtitle?: string;
  /** Rendered at the right end of the header row — a filter, a link. */
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SectionHeader({ title, subtitle, action, style }: SectionProps) {
  const styles = useThemedStyles(sheet);

  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionText}>
        <ThemedText variant="overline" tone="textTertiary">
          {title.toUpperCase()}
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
      ...t.elevation[1],
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
      // Full-bleed inside a padded card: cancel the padding so the line runs
      // edge to edge like a real separator rather than a floating dash.
      marginHorizontal: -t.space.three,
    },
  });
