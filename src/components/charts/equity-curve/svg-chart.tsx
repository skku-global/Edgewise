/**
 * Equity curve drawn with react-native-svg — the only renderer.
 *
 * No async loading step, no platform split, and it server-renders cleanly under
 * `web.output: "static"`, which is most of the reason it replaced the Skia
 * version outright rather than sitting behind it as a fallback.
 *
 * Everything here is hand-computed: the domain, the projection from P/L to
 * pixels, and both `d` strings. No charting library is involved.
 */

import { useId, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

import { ChartFrame } from './chart-frame';
import { DEFAULT_CHART_HEIGHT, type EquityCurveProps } from './types';

const PADDING = { top: 14, right: 10, bottom: 14, left: 10 };

export default function SvgEquityChart({
  points,
  height = DEFAULT_CHART_HEIGHT,
  tone,
  testID,
}: EquityCurveProps) {
  const theme = useTheme();

  // Width comes from layout rather than a prop so the card can be any width.
  // It is 0 during server rendering and on the first client frame.
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (Math.abs(current - next) > 0.5 ? next : current));
  };

  if (points.length < 2) {
    return <ChartFrame height={height} label="Log at least two trades to see your equity curve." />;
  }

  const last = points[points.length - 1].equity;
  const isGain = (tone ?? (last >= 0 ? 'gain' : 'loss')) === 'gain';

  return (
    <View testID={testID} onLayout={onLayout} style={[styles.container, { height }]}>
      {width > 0 ? (
        <Curve
          points={points}
          width={width}
          height={height}
          stroke={isGain ? theme.color.gain : theme.color.loss}
          zeroLine={theme.color.chartAxis}
          dotRing={theme.color.surface}
        />
      ) : null}
    </View>
  );
}

type CurveProps = {
  points: EquityCurveProps['points'];
  width: number;
  height: number;
  stroke: string;
  zeroLine: string;
  dotRing: string;
};

function Curve({ points, width, height, stroke, zeroLine, dotRing }: CurveProps) {
  // SVG gradient ids are document-global, so two curves on one screen would
  // otherwise share — and fight over — the same definition. useId is stable
  // across server render and hydration, which a counter or random value is not.
  const fillId = `equity-fill-${useId()}`;

  const plotWidth = Math.max(width - PADDING.left - PADDING.right, 1);
  const plotHeight = Math.max(height - PADDING.top - PADDING.bottom, 1);

  const values = points.map((point) => point.equity);
  // Always include 0 in the domain so the break-even line stays on screen and
  // an all-profit curve doesn't look like it starts at a loss.
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  // A perfectly flat series would divide by zero; give it a 1-unit band.
  const span = rawMax - rawMin || 1;

  const xAt = (index: number) =>
    PADDING.left + (index / (points.length - 1)) * plotWidth;
  const yAt = (value: number) =>
    PADDING.top + (1 - (value - rawMin) / span) * plotHeight;

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(2)},${yAt(point.equity).toFixed(2)}`)
    .join(' ');

  const zeroY = yAt(0);
  // Close the area back down to the break-even line, not the bottom edge, so a
  // losing stretch fills downward from zero rather than hanging off the axis.
  const area = `${line} L${xAt(points.length - 1).toFixed(2)},${zeroY.toFixed(2)} L${xAt(0).toFixed(2)},${zeroY.toFixed(2)} Z`;

  const lastX = xAt(points.length - 1);
  const lastY = yAt(points[points.length - 1].equity);

  return (
    <Svg width={width} height={height}>
      <Defs>
        {/* Fades toward the break-even line so the fill reads as depth under the
            curve rather than a flat block of colour. */}
        <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity={0.22} />
          <Stop offset="1" stopColor={stroke} stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill={`url(#${fillId})`} />
      <Line
        x1={PADDING.left}
        y1={zeroY}
        x2={PADDING.left + plotWidth}
        y2={zeroY}
        stroke={zeroLine}
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <Path d={line} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={lastX} cy={lastY} r={4} fill={stroke} stroke={dotRing} strokeWidth={2} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
});
