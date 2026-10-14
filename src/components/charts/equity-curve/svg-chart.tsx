/**
 * Equity curve drawn with react-native-svg, the only renderer.
 *
 * Everything is hand-computed: the domain, the projection from P/L to pixels,
 * and both `d` strings. On first mount the line draws in once; later data
 * changes (live trades) update in place without replaying it. Reduce-motion
 * skips the animation entirely.
 */

import { useEffect, useId, useState } from 'react';
import { AccessibilityInfo, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

import { ChartFrame } from './chart-frame';
import { DEFAULT_CHART_HEIGHT, type EquityCurveProps } from './types';

const PADDING = { top: 14, right: 10, bottom: 14, left: 10 };
const DRAW_MS = 800;

/** 0 to 1 once, on mount, eased out. Jumps straight to 1 under reduce-motion. */
function useDrawIn(): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (cancelled) {
          return;
        }
        if (reduced) {
          setProgress(1);
          return;
        }
        const start = Date.now();
        const tick = () => {
          if (cancelled) {
            return;
          }
          const t = Math.min((Date.now() - start) / DRAW_MS, 1);
          setProgress(1 - Math.pow(1 - t, 3));
          if (t < 1) {
            frame = requestAnimationFrame(tick);
          }
        };
        frame = requestAnimationFrame(tick);
      })
      .catch(() => setProgress(1));

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  return progress;
}

export default function SvgEquityChart({
  points,
  height = DEFAULT_CHART_HEIGHT,
  tone,
  testID,
}: EquityCurveProps) {
  const theme = useTheme();

  // Width comes from layout so the card can be any width. It is 0 during
  // server rendering and on the first client frame.
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
  // SVG gradient ids are document-global; useId is stable across server render
  // and hydration.
  const fillId = `equity-fill-${useId()}`;
  const progress = useDrawIn();

  const plotWidth = Math.max(width - PADDING.left - PADDING.right, 1);
  const plotHeight = Math.max(height - PADDING.top - PADDING.bottom, 1);

  const values = points.map((point) => point.equity);
  // Always include 0 so the break-even line stays on screen.
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const span = rawMax - rawMin || 1;

  const xAt = (index: number) => PADDING.left + (index / (points.length - 1)) * plotWidth;
  const yAt = (value: number) => PADDING.top + (1 - (value - rawMin) / span) * plotHeight;

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(2)},${yAt(point.equity).toFixed(2)}`)
    .join(' ');

  const zeroY = yAt(0);
  const area = `${line} L${xAt(points.length - 1).toFixed(2)},${zeroY.toFixed(2)} L${xAt(0).toFixed(2)},${zeroY.toFixed(2)} Z`;

  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(xAt(i) - xAt(i - 1), yAt(points[i].equity) - yAt(points[i - 1].equity));
  }
  length = Math.max(length, 1);

  const drawing = progress < 1;
  const lastX = xAt(points.length - 1);
  const lastY = yAt(points[points.length - 1].equity);

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity={0.22} />
          <Stop offset="1" stopColor={stroke} stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill={`url(#${fillId})`} opacity={progress} />
      <Line
        x1={PADDING.left}
        y1={zeroY}
        x2={PADDING.left + plotWidth}
        y2={zeroY}
        stroke={zeroLine}
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <Path
        d={line}
        stroke={stroke}
        strokeWidth={2}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeDasharray={drawing ? `${length} ${length}` : undefined}
        strokeDashoffset={drawing ? length * (1 - progress) : undefined}
      />
      {drawing ? null : (
        <Circle cx={lastX} cy={lastY} r={4} fill={stroke} stroke={dotRing} strokeWidth={2} />
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
});
