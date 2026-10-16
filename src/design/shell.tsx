import React from 'react';
import { Animated, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme';
import { IconName, hovered } from './ui';
import { useLoop } from './motion';

// WIRE: replace with the signed-in user's initials
const INITIALS = 'CM';

const TABS: { label: string; short: string; href: string; icon: IconName }[] = [
  { label: 'Dashboard', short: 'Home', href: '/', icon: 'home-outline' },
  { label: 'Trades', short: 'Trades', href: '/trades', icon: 'swap-vertical-outline' },
  { label: 'Calendar', short: 'Calendar', href: '/calendar', icon: 'calendar-outline' },
  { label: 'Reports', short: 'Reports', href: '/reports', icon: 'bar-chart-outline' },
  { label: 'Coach', short: 'Coach', href: '/chat', icon: 'chatbubble-ellipses-outline' },
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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Account"
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{INITIALS}</Text>
      </Pressable>
    </View>
  );
}

function Dock({ path }: { path: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 12, alignItems: 'center' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          padding: 6,
          borderRadius: 999,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: '#101412',
          shadowOpacity: 0.12,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }}
      >
        {TABS.map((t) => {
          const on = isActive(path, t.href);
          return (
            <Pressable
              key={t.href}
              accessibilityRole="link"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: on }}
              onPress={() => router.push(t.href as never)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 42,
                paddingHorizontal: on ? 14 : 11,
                borderRadius: 999,
                backgroundColor: on ? colors.ink : 'transparent',
              }}
            >
              <Ionicons name={t.icon} size={20} color={on ? '#FFFFFF' : colors.muted} />
              {on ? <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>{t.short}</Text> : null}
            </Pressable>
          );
        })}
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
      {wide ? null : <Dock path={path} />}
      {path === '/chat' ? null : <CoachFab bottom={wide ? 28 : insets.bottom + 84} tip={wide} />}
    </View>
  );
}
