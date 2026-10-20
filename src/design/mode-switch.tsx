import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors } from './theme';
import { useDesignMode } from './mode';

/** Small pill for the white design's wide header: switches to the dark design. */
export function ModeButton() {
  const { mode, toggle } = useDesignMode();
  const isDark = mode === 'dark';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isDark ? "Switch to the white design" : "Switch to the dark design"}
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
      <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={18} color={colors.ink} />
      <Text style={{ fontSize: 15, color: colors.ink }}>{isDark ? "White design" : "Dark design"}</Text>
    </Pressable>
  );
}

/** One sun/moon pill toggle, identical in both designs. Lives in the nav bar. */
export function ModeToggle() {
  const { mode, toggle } = useDesignMode();
  const isDark = mode === 'dark';
  const knob = (on: boolean) => ({
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: on ? colors.green : 'transparent',
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isDark ? 'Switch to the white design' : 'Switch to the dark design'}
      onPress={toggle}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 40,
        padding: 3,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.card,
      }}
    >
      <View style={knob(!isDark)}>
        <Ionicons name="sunny" size={16} color={!isDark ? '#FFFFFF' : colors.muted} />
      </View>
      <View style={knob(isDark)}>
        <Ionicons name="moon" size={15} color={isDark ? '#0A1210' : colors.muted} />
      </View>
    </Pressable>
  );
}
