#!/usr/bin/env bash
set +H
cd "$(dirname "$0")" || exit 1

cp src/design/shell.tsx .redesign-backup/shell.dock.tsx.bak 2>/dev/null
sed -i 's/paddingBottom: 170/paddingBottom: 120/' src/design/ui.tsx

cat > src/design/menu.tsx <<'EOF'
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
EOF

cat > src/design/shell.tsx <<'EOF'
import React from 'react';
import { Animated, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme';
import { hovered } from './ui';
import { useLoop } from './motion';
import HamburgerMenu from './menu';

// WIRE: replace with the signed-in user's initials
const INITIALS = 'CM';

const TABS: { label: string; href: string }[] = [
  { label: 'Dashboard', href: '/' },
  { label: 'Trades', href: '/trades' },
  { label: 'Calendar', href: '/calendar' },
  { label: 'Reports', href: '/reports' },
  { label: 'Coach', href: '/chat' },
];

const isActive = (path: string, href: string) =>
  href === '/' ? path === '/' : path === href || path.startsWith(href + '/');

function Header({ path, wide }: { path: string; wide: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        width: '100%',
        maxWidth: 1200,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: insets.top + 14,
        paddingBottom: 14,
      }}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Edgewise home"
        onPress={() => router.push('/' as never)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>E</Text>
        </View>
        <Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: colors.ink }}>Edgewise</Text>
      </Pressable>

      {wide ? (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {TABS.map((t) => {
            const on = isActive(path, t.href);
            return (
              <Pressable
                key={t.href}
                accessibilityRole="link"
                accessibilityState={{ selected: on }}
                onPress={() => router.push(t.href as never)}
                style={(s) => ({
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  borderRadius: 999,
                  backgroundColor: on ? colors.mintTint : hovered(s) ? colors.skeleton : 'transparent',
                })}
              >
                <Text style={{ fontSize: 16, fontWeight: on ? '600' : '400', color: on ? colors.greenDark : colors.muted }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {wide ? null : <HamburgerMenu tabs={TABS} path={path} isActive={isActive} />}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{INITIALS}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CoachFab({ bottom, tip }: { bottom: number; tip: boolean }) {
  const router = useRouter();
  const ring = useLoop(2400);
  const scale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  const t = useLoop(10000);
  const tipOpacity = t.interpolate({ inputRange: [0, 0.55, 0.62, 0.86, 0.93, 1], outputRange: [0, 0, 1, 1, 0, 0] });
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 20, bottom, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {tip ? (
        <Animated.View
          pointerEvents="none"
          style={{
            opacity: tipOpacity,
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 14,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 15, color: colors.ink }}>Stuck on a trade? Ask Coach.</Text>
        </Animated.View>
      ) : null}
      <View style={{ width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: colors.green, opacity: ringOpacity, transform: [{ scale }] }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask Coach"
          onPress={() => router.push('/chat' as never)}
          style={(s) => ({
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: colors.green,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: hovered(s) ? 1.06 : 1 }],
          })}
        >
          <Ionicons name="chatbubble-ellipses" size={26} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const path = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header path={path} wide={wide} />
      <View style={{ flex: 1 }}>{children}</View>
      {path === '/chat' ? null : <CoachFab bottom={wide ? 28 : insets.bottom + 20} tip={wide} />}
    </View>
  );
}
EOF

echo "---- type check ----"
npx tsc --noEmit 2>&1 | head -40
echo "---- done ----"
