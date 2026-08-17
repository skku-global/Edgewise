/**
 * Shape of the daily P/L bar chart, kept separate from the renderer so screens
 * can import the types without pulling in react-native-svg.
 */

/** One bar. `key` is only used for React identity, never drawn. */
export type DailyBar = {
  key: string;
  pl: number;
};

export type DailyPlChartProps = {
  bars: DailyBar[];
  height?: number;
  testID?: string;
};

export const DEFAULT_BAR_CHART_HEIGHT = 170;

/**
 * Past this many bars the columns are thinner than the gaps between them and the
 * chart reads as noise. Screens slice to this before rendering; the component
 * itself draws whatever it is handed.
 */
export const MAX_VISIBLE_BARS = 45;
