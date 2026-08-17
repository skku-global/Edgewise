/**
 * Ambient light for the auth screen.
 *
 * Two soft green glows over the charcoal page. The reason to bother: a
 * full-bleed flat dark background is the single thing that makes an otherwise
 * well-built sign-in screen look like a bootstrap template. A pair of
 * off-centre radial gradients gives the page a light source, so the card reads
 * as sitting *on* something.
 *
 * Both glows are the locked green at low alpha — a derived shade, not a new
 * colour — so this cannot drift the palette. It is also why they are drawn in
 * SVG rather than with a gradient package: react-native-svg is already a
 * dependency for the charts, and this needs no new one.
 *
 * `pointerEvents="none"` on the wrapper: it covers the whole page, and a
 * decorative layer that swallows taps on the form underneath it would be a
 * genuinely baffling bug.
 */

import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { Brand } from '@/constants/theme';

const glows = [
  { id: 'edgewise-glow-top', color: Brand.greenBright, opacity: 0.2, cx: '16%', cy: '10%', r: '46%' },
  { id: 'edgewise-glow-bottom', color: Brand.green, opacity: 0.28, cx: '88%', cy: '94%', r: '44%' },
] as const;

export function AuthBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          {glows.map((glow) => (
            // cx/cy/r default to the gradient's own bounding box, so 50/50/50
            // means "fill the circle this paints" regardless of its size.
            <RadialGradient key={glow.id} id={glow.id} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={glow.color} stopOpacity={glow.opacity} />
              <Stop offset="1" stopColor={glow.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>

        {glows.map((glow) => (
          <Circle
            key={glow.id}
            cx={glow.cx}
            cy={glow.cy}
            r={glow.r}
            fill={`url(#${glow.id})`}
          />
        ))}
      </Svg>
    </View>
  );
}
