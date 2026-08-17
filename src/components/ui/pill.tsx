/**
 * Pill — the small rounded label used for direction, mood, source and status.
 *
 * `tone` covers the four meanings the app actually has, and `solid` chooses
 * between a filled pill (a fact about the trade: BUY, SELL) and a tinted one (a
 * softer annotation: a mood, a broker name). Filled pills use `textOnFill`,
 * which is the only text colour that survives on both schemes' accent — dark
 * mode's is the bright green, where white fails contrast.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText, type TextTone } from '@/components/themed-text';
import type { Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/styles';

export type PillTone = 'gain' | 'loss' | 'accent' | 'neutral';

export type PillProps = {
  label: string;
  tone?: PillTone;
  /** Filled rather than tinted. Reserve for facts, not annotations. */
  solid?: boolean;
  /** Upper-cases the label, for tickers and directions. */
  caps?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Pill({ label, tone = 'neutral', solid = false, caps = false, style }: PillProps) {
  const styles = useThemedStyles(sheet);
  const fill = solid ? styles[`${tone}Solid` as const] : styles[`${tone}Soft` as const];

  return (
    <View style={[styles.pill, fill, style]}>
      <ThemedText variant="caption" tone={solid ? 'textOnFill' : softTone[tone]}>
        {caps ? label.toUpperCase() : label}
      </ThemedText>
    </View>
  );
}

const softTone: Record<PillTone, TextTone> = {
  gain: 'gain',
  loss: 'loss',
  accent: 'accentText',
  neutral: 'textSecondary',
};

const sheet = (t: Theme) =>
  StyleSheet.create({
    pill: {
      paddingHorizontal: t.space.two,
      paddingVertical: t.space.half,
      borderRadius: t.radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'transparent',
      alignSelf: 'flex-start',
    },

    gainSolid: { backgroundColor: t.color.gain },
    lossSolid: { backgroundColor: t.color.loss },
    accentSolid: { backgroundColor: t.color.accent },
    neutralSolid: { backgroundColor: t.color.neutral },

    gainSoft: { backgroundColor: t.color.gainSoft, borderColor: t.color.gain },
    lossSoft: { backgroundColor: t.color.lossSoft, borderColor: t.color.loss },
    accentSoft: { backgroundColor: t.color.accentSoft, borderColor: t.color.accent },
    // The only tone with no colour to lean on, so it borrows the card border.
    neutralSoft: { backgroundColor: 'transparent', borderColor: t.color.borderStrong },
  });
