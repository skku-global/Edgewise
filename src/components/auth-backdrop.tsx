/**
 * Flat ground with a faint chart-paper grid. No glow, no gradient.
 * `pointerEvents="none"`: it covers the page and must never swallow taps.
 */

import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';

import { Brand } from '@/constants/theme';

const CELL = 48;

export function AuthBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="edgewise-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            <Path
              d={`M${CELL} 0 H0 V${CELL}`}
              fill="none"
              stroke={Brand.greenBright}
              strokeOpacity={0.06}
              strokeWidth={1}
            />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#edgewise-grid)" />
      </Svg>
    </View>
  );
}
