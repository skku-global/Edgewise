import React, { useRef, useState } from 'react';
import { Animated, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, ease, native } from './theme';
import { useReducedMotion } from './motion';

export type MenuTab = { label: string; href: string };

export default function HamburgerMenu({
  tabs,
  path,
  isActive,
}: {
  tabs: MenuTab[];
  path: string;
  isActive: (path: string, href: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;

  const show = () => {
    setOpen(true);
    Animated.timing(t, { toValue: 1, duration: reduce ? 200 : 700, easing: ease, useNativeDriver: native }).start();
  };

  const hide = (after?: () => void) => {
    Animated.timing(t, { toValue: 0, duration: reduce ? 150 : 500, easing: ease, useNativeDriver: native }).start(() => {
      setOpen(false);
      if (after) after();
    });
  };

  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : -height, 0] });

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        accessibilityState={{ expanded: open }}
        onPress={show}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.line,
        }}
      >
        <Ionicons name="menu" size={22} color={colors.ink} />
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => hide()}>
        <Animated.View
          style={{
            flex: 1,
            backgroundColor: colors.ink,
            opacity: reduce ? t : 1,
            transform: [{ translateY }],
            paddingTop: insets.top + 14,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 20,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>E</Text>
              </View>
              <Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: '#FFFFFF' }}>Edgewise</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              onPress={() => hide()}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#3A423E' }}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={{ flex: 1, justifyContent: 'center' }}>
            {tabs.map((tab, i) => {
              const on = isActive(path, tab.href);
              const start = 0.35 + i * 0.07;
              const opacity = t.interpolate({ inputRange: [start, Math.min(start + 0.3, 1)], outputRange: [0, 1], extrapolate: 'clamp' });
              const ty = t.interpolate({ inputRange: [start, Math.min(start + 0.3, 1)], outputRange: [reduce ? 0 : 24, 0], extrapolate: 'clamp' });
              return (
                <Animated.View key={tab.href} style={{ opacity, transform: [{ translateY: ty }] }}>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityState={{ selected: on }}
                    onPress={() => hide(() => router.push(tab.href as never))}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'baseline',
                      gap: 14,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: '#2A312D',
                    }}
                  >
                    <Text style={{ fontSize: 15, color: '#8A948F' }}>{'0' + (i + 1)}</Text>
                    <Text style={{ fontSize: 40, fontWeight: '700', letterSpacing: -1.2, color: on ? colors.mint : '#FFFFFF' }}>
                      {tab.label}
                    </Text>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>
      </Modal>
    </>
  );
}
