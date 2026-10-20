import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export type BrandMarkProps = { size?: number };

export function BrandMark({ size = 56 }: BrandMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#17251F" />
          <Stop offset="1" stopColor="#070D0B" />
        </LinearGradient>
        <LinearGradient id="fg" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#3FBF80" />
          <Stop offset="1" stopColor="#C6FADF" />
        </LinearGradient>
      </Defs>
      <Rect width="56" height="56" rx="16" fill="url(#bg)" />
      <Path d="M17.52 12 L23.52 12 L16.48 44 L10.48 44 Z" fill="url(#fg)" fillOpacity={0.55} />
      <Path d="M17.8 38 L34.8 38 L33.48 44 L16.48 44 Z" fill="url(#fg)" fillOpacity={0.55} />
      <Path d="M20.66 25 L33.66 25 L32.34 31 L19.34 31 Z" fill="url(#fg)" fillOpacity={0.75} />
      <Path d="M23.52 12 L41.52 12 L46.86 15 L40.2 18 L22.2 18 Z" fill="url(#fg)" />
    </Svg>
  );
}
