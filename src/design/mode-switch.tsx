import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Pressable, Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { colors } from './theme';
import { useDesignMode } from './mode';

/** Small pill for the white design's wide header: switches to the dark design. */
export function ModeButton() {
  const { toggle } = useDesignMode();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Switch to the dark design"
      onPress={toggle}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: 44,
        paddingHorizontal: 16,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.card,
      }}
    >
      <Ionicons name="moon-outline" size={18} color={colors.ink} />
      <Text style={{ fontSize: 15, color: colors.ink }}>Dark design</Text>
    </Pressable>
  );
}

/** Floating pill shown only in the dark design, so there is always a way back to white. */
export function ModeSwitchFloating() {
  const theme = useTheme();
  const { toggle } = useDesignMode();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Switch to the white design"
      onPress={toggle}
      style={{
        position: 'absolute',
        left: 16,
        bottom: Platform.OS === 'web' ? 16 : 92,
        zIndex: 1000,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.color.borderStrong,
        backgroundColor: theme.color.surface,
      }}
    >
      <Ionicons name="sunny-outline" size={18} color={theme.color.text} />
      <Text style={{ fontSize: 14, color: theme.color.text }}>White design</Text>
    </Pressable>
  );
}
