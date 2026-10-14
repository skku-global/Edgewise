/**
 * The Edgewise mark: a flat mint tile with a rising line and its end point.
 * Drawn in SVG so it stays sharp at every size.
 */

import Svg, { Circle, Polyline, Rect } from 'react-native-svg';

import { Brand } from '@/constants/theme';

export type BrandMarkProps = {
  /** Rendered square. The artwork is a 56pt grid scaled to fit. */
  size?: number;
};

export function BrandMark({ size = 56 }: BrandMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      <Rect x="0" y="0" width="56" height="56" rx="8" fill={Brand.greenBright} />
      <Polyline
        points="12,38 22,30 31,34 44,18"
        fill="none"
        stroke={Brand.charcoal}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="44" cy="18" r="4.5" fill={Brand.charcoal} />
    </Svg>
  );
}
