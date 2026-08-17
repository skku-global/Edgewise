/**
 * Equity curve — the single import point for screens.
 *
 * One renderer: `svg-chart`, drawn by hand with react-native-svg. There was
 * briefly a victory-native/Skia implementation behind a platform-split async
 * loader; it was removed deliberately. Skia bought antialiased curves at the
 * cost of an 8MB CanvasKit binary to serve, a postinstall step to regenerate
 * it, a `WithSkiaWeb` mount-state dance to survive `web.output: "static"`
 * server rendering, and a React Compiler opt-out. For a line, an area fill and
 * a break-even rule, plain SVG paths draw the same picture with none of it.
 */

export type { EquityCurveProps, EquityPoint } from './types';
export { DEFAULT_CHART_HEIGHT } from './types';

export { default as EquityCurve } from './svg-chart';
