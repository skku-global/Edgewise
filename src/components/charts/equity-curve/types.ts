/**
 * The equity curve's public contract.
 *
 * Plain serialisable numbers, with no renderer types leaking out. That is what
 * let the victory-native/Skia implementation be swapped for the hand-drawn SVG
 * one without a single calling screen changing.
 */

/** One point on the cumulative P/L curve. */
export type EquityPoint = {
  /**
   * Epoch milliseconds — a number rather than a Date so the series stays
   * trivially serialisable.
   *
   * Worth knowing: the chart spaces points evenly by index and does not read
   * this value, so a fortnight between two trades looks identical to an hour
   * between them. It is a trade-by-trade curve, not a time axis. Plotting
   * against real time is the change to make if the gaps ever start to matter.
   */
  t: number;
  /** Running total P/L up to and including this trade. */
  equity: number;
};

export type EquityCurveProps = {
  /** Chronologically ascending. Fewer than 2 points renders the empty state. */
  points: EquityPoint[];
  /**
   * Fixed height in px. Explicit rather than flex-derived so that the empty
   * state reserves exactly the height the drawn chart will occupy, and the
   * dashboard doesn't reflow the moment a second trade turns it into a curve.
   */
  height?: number;
  /** Overrides the stroke colour that is otherwise derived from final equity. */
  tone?: 'gain' | 'loss';
  testID?: string;
};

export const DEFAULT_CHART_HEIGHT = 220;
