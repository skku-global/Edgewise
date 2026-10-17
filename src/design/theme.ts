import { Easing, Platform } from 'react-native';
import { getDesignMode } from './mode';

const lightPalette = {
  bg: '#F5F7F6',
  card: '#FFFFFF',
  border: '#E1E7E3',
  line: '#CBD5CF',
  ink: '#101412',
  muted: '#4A5651',
  green: '#0F7A4B',
  greenDark: '#0B5A37',
  mint: '#6EE0A5',
  mintTint: '#E0F2E8',
  onMint: '#06301D',
  red: '#B3322A',
  skeleton: '#E8EDEA',
  tile: '#E4E2DC',
  /** Text on the small mint tags. */
  tagText: '#0B5A37',
};

export type Palette = typeof lightPalette;

// The same layout in the dark design: charcoal-green surfaces, the bright green accent.
const darkPalette: Palette = {
  bg: '#0A1210',
  card: '#101A16',
  border: '#1F2F28',
  line: '#2A3C33',
  ink: '#E8F1EC',
  muted: '#9DB2A6',
  green: '#6FE3A8',
  greenDark: '#0B5A37',
  mint: '#6EE0A5',
  mintTint: '#10261C',
  onMint: '#06301D',
  red: '#E0675E',
  skeleton: '#16221D',
  tile: '#1B2B24',
  tagText: '#6FE3A8',
};

/**
 * Same names as before, so every screen keeps using `colors.ink` and friends.
 * Each one is looked up when it is read, so it follows the current design mode.
 */
export const colors = {} as Palette;
(Object.keys(lightPalette) as (keyof Palette)[]).forEach((key) => {
  Object.defineProperty(colors, key, {
    enumerable: true,
    get: () => (getDesignMode() === 'dark' ? darkPalette : lightPalette)[key],
  });
});

export const ease = Easing.bezier(0.76, 0, 0.24, 1);
export const native = Platform.OS !== 'web';
