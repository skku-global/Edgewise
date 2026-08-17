/**
 * Daily net P/L bar chart — the single import point for screens.
 *
 * Mirrors the equity curve's layout: one renderer, plain react-native-svg, no
 * platform split and no async loader. See `../equity-curve/index.tsx` for why
 * that shape was chosen over a Skia-backed one.
 */

export type { DailyBar, DailyPlChartProps } from './types';
export { DEFAULT_BAR_CHART_HEIGHT, MAX_VISIBLE_BARS } from './types';
export { default as DailyPlChart } from './bar-chart';
