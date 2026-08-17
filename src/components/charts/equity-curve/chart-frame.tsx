/**
 * Fixed-height placeholder for the one state that isn't a drawn curve: fewer
 * than two trades, so there is nothing to join up yet.
 *
 * It reserves the full chart height rather than collapsing, which keeps the
 * dashboard from reflowing the moment a second trade turns this into a chart.
 */

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/styles';

import { DEFAULT_CHART_HEIGHT } from './types';

type ChartFrameProps = {
  height?: number;
  label: string;
};

export function ChartFrame({ height = DEFAULT_CHART_HEIGHT, label }: ChartFrameProps) {
  const styles = useThemedStyles(sheet);

  return (
    <View style={[styles.frame, { height }]}>
      <ThemedText variant="caption" tone="textTertiary" style={styles.label}>
        {label}
      </ThemedText>
    </View>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    frame: {
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.lg,
      backgroundColor: t.color.bgSunken,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: t.space.three,
    },
    label: {
      textAlign: 'center',
      maxWidth: 240,
    },
  });
