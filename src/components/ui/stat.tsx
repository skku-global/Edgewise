/**
 * Stat — one figure with a label above and a caption below.
 *
 * The value is set in `monoXl`, so a column of these lines up on the decimal
 * point and does not shuffle sideways as digits change width. That is the
 * difference between a dashboard that looks calculated and one that looks
 * animated.
 *
 * `tone` colours the value only. The label and caption stay neutral, because a
 * screen where every element is red is a screen with no emphasis at all.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText, type TextTone } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import type { Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/styles';

export type StatTone = 'text' | 'gain' | 'loss';

export type StatProps = {
  label: string;
  value: string;
  caption?: string;
  tone?: StatTone;
  /** Drops the card chrome, for a stat already inside one. */
  bare?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Stat({ label, value, caption, tone = 'text', bare = false, style }: StatProps) {
  const styles = useThemedStyles(sheet);

  const body = (
    <>
      <ThemedText variant="label" tone="textSecondary">
        {label}
      </ThemedText>
      <ThemedText variant="monoXl" tone={tone as TextTone} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </ThemedText>
      {caption ? (
        <ThemedText variant="caption" tone="textTertiary">
          {caption}
        </ThemedText>
      ) : null}
    </>
  );

  if (bare) {
    return <View style={[styles.bare, style]}>{body}</View>;
  }

  return <Card style={[styles.card, style]}>{body}</Card>;
}

/** Sign-aware tone: what almost every caller wants for a P/L figure. */
export function toneFor(value: number): StatTone {
  if (value > 0) {
    return 'gain';
  }
  if (value < 0) {
    return 'loss';
  }
  return 'text';
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    card: {
      flex: 1,
      gap: t.space.half,
      // Fixed floor so two stats side by side stay the same height whether or
      // not both have a caption.
      minHeight: 104,
      justifyContent: 'center',
    },
    bare: {
      gap: t.space.half,
    },
  });
