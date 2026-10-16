import { Easing, Platform } from 'react-native';

export const colors = {
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
};

export const ease = Easing.bezier(0.76, 0, 0.24, 1);
export const native = Platform.OS !== 'web';
