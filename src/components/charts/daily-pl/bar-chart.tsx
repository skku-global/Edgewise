/**
 * Net P/L per trading day, drawn as bars with react-native-svg.
 *
 * The same hand-built approach as the equity curve, and for the same reasons:
 * no Skia binary to serve, no async loader, and it server-renders cleanly under
 * `web.output: "static"`. Domain, projection and every rect are computed here.
 *
 * The two charts complement rather than duplicate each other — the curve shows
 * where the account has got to, these bars show how bumpy the ride was. A
 * gently rising curve made of one huge green day and nine small red ones is a
 * different account from one made of ten small green days, and only this chart
 * shows the difference.
 */

import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import type { Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemedStyles } from '@/lib/styles';

import { DEFAULT_BAR_CHART_HEIGHT, type DailyPlChartProps } from './types';

const PADDING = { top: 12, right: 4, bottom: 12, left: 4 };
/** Fraction of each slot the bar fills; the rest is the gap to its neighbour. */
const BAR_FILL = 0.68;

export default function DailyPlChart({
  bars,
  height = DEFAULT_BAR_CHART_HEIGHT,
  testID,
}: DailyPlChartProps) {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);

  // From layout, not a prop, so the card can be any width. 0 during server
  // rendering and on the first client frame.
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (Math.abs(current - next) > 0.5 ? next : current));
  };

  if (bars.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <ThemedText variant="caption" tone="textTertiary" style={styles.emptyLabel}>
          No trading days in this range yet.
        </ThemedText>
      </View>
    );
  }

  return (
    <View testID={testID} onLayout={onLayout} style={[styles.container, { height }]}>
      {width > 0 ? (
        <Bars
          bars={bars}
          width={width}
          height={height}
          gain={theme.color.gain}
          loss={theme.color.loss}
          axis={theme.color.chartAxis}
        />
      ) : null}
    </View>
  );
}

type BarsProps = {
  bars: DailyPlChartProps['bars'];
  width: number;
  height: number;
  gain: string;
  loss: string;
  axis: string;
};

function Bars({ bars, width, height, gain, loss, axis }: BarsProps) {
  const plotWidth = Math.max(width - PADDING.left - PADDING.right, 1);
  const plotHeight = Math.max(height - PADDING.top - PADDING.bottom, 1);

  const values = bars.map((bar) => bar.pl);
  // Symmetric around zero rather than fitted to the data: bars are read against
  // the baseline, and a domain of -10..+400 would make a -10 day look like a
  // rounding error when it is a real loss. Equal scale up and down keeps a
  // green bar and a red bar of the same size the same length.
  const extent = Math.max(Math.abs(Math.min(0, ...values)), Math.max(0, ...values)) || 1;

  const zeroY = PADDING.top + plotHeight / 2;
  const scale = plotHeight / 2 / extent;

  const slot = plotWidth / bars.length;
  const barWidth = Math.max(slot * BAR_FILL, 1);

  return (
    <Svg width={width} height={height}>
      {bars.map((bar, index) => {
        const magnitude = Math.abs(bar.pl) * scale;
        // A break-even day still gets a visible sliver, so a gap in the bars
        // always means "no trades" and never "traded, but flat".
        const barHeight = Math.max(magnitude, 1);
        const x = PADDING.left + index * slot + (slot - barWidth) / 2;
        const y = bar.pl >= 0 ? zeroY - barHeight : zeroY;

        return (
          <Rect
            key={bar.key}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={Math.min(2, barWidth / 2)}
            fill={bar.pl >= 0 ? gain : loss}
            fillOpacity={0.85}
          />
        );
      })}

      <Line
        x1={PADDING.left}
        y1={zeroY}
        x2={PADDING.left + plotWidth}
        y2={zeroY}
        stroke={axis}
        strokeWidth={1}
      />
    </Svg>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    container: {
      width: '100%',
      overflow: 'hidden',
    },
    empty: {
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.lg,
      backgroundColor: t.color.bgSunken,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: t.space.three,
    },
    emptyLabel: {
      textAlign: 'center',
      maxWidth: 240,
    },
  });
