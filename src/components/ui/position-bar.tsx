/**
 * PositionBar: one trade's result as a bar from a centre line.
 * Gain grows right, loss grows left, length is relative to `max`
 * (normally the largest absolute P/L in the list being shown).
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type PositionBarProps = {
  value: number;
  max: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

export function PositionBar({ value, max, height = 6, style }: PositionBarProps) {
  const theme = useTheme();
  const pct = max > 0 ? Math.min(Math.abs(value) / max, 1) * 100 : 0;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={value >= 0 ? 'Gain relative to your largest trade' : 'Loss relative to your largest trade'}
      style={[styles.track, { height, backgroundColor: theme.color.surfaceActive }, style]}
    >
      <View style={styles.half}>
        {value < 0 ? (
          <View
            style={[
              styles.fill,
              { width: `${pct}%`, backgroundColor: theme.color.loss, alignSelf: 'flex-end' },
            ]}
          />
        ) : null}
      </View>
      <View style={[styles.tick, { backgroundColor: theme.color.borderStrong }]} />
      <View style={styles.half}>
        {value > 0 ? (
          <View style={[styles.fill, { width: `${pct}%`, backgroundColor: theme.color.gain }]} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 2,
    overflow: 'hidden',
  },
  half: {
    flex: 1,
  },
  fill: {
    height: '100%',
  },
  tick: {
    width: 1,
  },
});
