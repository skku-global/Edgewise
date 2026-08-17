/**
 * The Edgewise mark.
 *
 * Drawn rather than shipped as a PNG so it stays sharp at every size and can be
 * recoloured from tokens — the app icon in assets/ is a raster for the stores,
 * but nothing in the UI should be.
 *
 * The figure is a rising line with the area filled underneath it: the most
 * direct way to say "trading" without a currency symbol or an arrow, both of
 * which every competitor already uses. It reads at 28px, which is the size the
 * account button needs, and that constraint is why there are four points on the
 * line and not eight.
 *
 * The gradient runs bright green to deep green rather than being flat. On the
 * charcoal hero a flat fill of either green looks like a coloured square; the
 * two-stop version reads as a lit surface, which is most of the difference
 * between a logo and a placeholder.
 */

import Svg, { Circle, Defs, LinearGradient, Path, Polyline, Rect, Stop } from 'react-native-svg';

import { Brand } from '@/constants/theme';

/**
 * A literal id, not a generated one. Two marks on the same web page would both
 * resolve `url(#...)` to the first definition — which is harmless, because both
 * definitions are identical, and it avoids `useId()` emitting the colons that
 * make an SVG fragment reference invalid.
 */
const TileGradientId = 'edgewise-mark-tile';

export type BrandMarkProps = {
  /** Rendered square. The artwork is a 56pt grid scaled to fit. */
  size?: number;
};

export function BrandMark({ size = 56 }: BrandMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      <Defs>
        <LinearGradient id={TileGradientId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={Brand.greenBright} />
          <Stop offset="1" stopColor={Brand.green} />
        </LinearGradient>
      </Defs>

      {/* rx is 16 on a 56 grid — the same 0.29 ratio as radius.xl on a card, so
          the mark and the panel it sits on share a corner language. */}
      <Rect x="0" y="0" width="56" height="56" rx="16" fill={`url(#${TileGradientId})`} />

      {/* Area under the curve. Low opacity white rather than a third green:
          the palette is four colours, and this needs to be a shade of the tile
          it sits on, not a new hue. */}
      <Path d="M12 38 L22 30 L31 34 L44 18 L44 44 L12 44 Z" fill={Brand.white} opacity={0.18} />

      <Polyline
        points="12,38 22,30 31,34 44,18"
        fill="none"
        stroke={Brand.white}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* The last point, called out. It is where the line is going. */}
      <Circle cx="44" cy="18" r="4.5" fill={Brand.white} />
    </Svg>
  );
}
