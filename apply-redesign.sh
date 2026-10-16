#!/usr/bin/env bash
set +H
cd "$(dirname "$0")" || exit 1

git switch ui-v2 || { echo "Could not switch to ui-v2. Commit or stash your changes first."; exit 1; }

mkdir -p .redesign-backup src/design
cp "src/app/(app)/_layout.tsx" .redesign-backup/_layout.tsx.bak
cp "src/app/(app)/index.tsx" .redesign-backup/index.tsx.bak
cp "src/app/(app)/trades.tsx" .redesign-backup/trades.tsx.bak
grep -qxF ".redesign-backup" .gitignore || printf '\n.redesign-backup\n' >> .gitignore

git switch -c redesign-ui 2>/dev/null || git switch redesign-ui

cat > src/design/theme.ts <<'EOF'
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
EOF

cat > src/design/motion.tsx <<'EOF'
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import { ease, native } from './theme';

export function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduce)
      .catch(() => {});
  }, []);
  return reduce;
}

export function Rise({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: reduce ? 250 : 700,
      delay,
      easing: ease,
      useNativeDriver: native,
    }).start();
  }, [reduce]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : 16, 0] });
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>
  );
}

export function useLoop(duration: number, pingPong = false) {
  const v = useRef(new Animated.Value(0)).current;
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const up = Animated.timing(v, {
      toValue: 1,
      duration,
      easing: pingPong ? Easing.inOut(Easing.ease) : Easing.linear,
      useNativeDriver: native,
    });
    const down = Animated.timing(v, {
      toValue: 0,
      duration,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: native,
    });
    const loop = Animated.loop(pingPong ? Animated.sequence([up, down]) : up);
    loop.start();
    return () => loop.stop();
  }, [reduce]);
  return v;
}
EOF

cat > src/design/ui.tsx <<'EOF'
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  PressableStateCallbackType,
  ScrollView,
  StyleProp,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, native } from './theme';
import { useLoop, useReducedMotion } from './motion';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const hovered = (s: PressableStateCallbackType) =>
  Boolean((s as unknown as { hovered?: boolean }).hovered);

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', paddingBottom: 170 }}>
      <View style={{ width: '100%', maxWidth: 1120, paddingHorizontal: 20, paddingTop: 16 }}>{children}</View>
    </ScrollView>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  return (
    <Text
      accessibilityRole="header"
      style={{ fontSize: width < 600 ? 34 : 44, fontWeight: '700', letterSpacing: -1.2, color: colors.ink }}
    >
      {children}
    </Text>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 15, fontWeight: '600', color: colors.muted }}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'dark';
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = variant === 'primary' ? colors.mint : variant === 'dark' ? colors.onMint : colors.card;
  const fg = variant === 'primary' ? colors.onMint : variant === 'dark' ? '#FFFFFF' : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(s) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 13,
          paddingHorizontal: 22,
          borderRadius: 999,
          backgroundColor: bg,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: hovered(s) ? colors.green : colors.line,
        },
        hovered(s) ? { transform: [{ translateY: -2 }] } : null,
        s.pressed ? { opacity: 0.85 } : null,
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: 'row',
        padding: 4,
        borderRadius: 999,
        backgroundColor: colors.skeleton,
        alignSelf: 'flex-start',
      }}
    >
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={o}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 18,
              borderRadius: 999,
              backgroundColor: on ? colors.card : 'transparent',
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: on ? '600' : '400', color: on ? colors.ink : colors.muted }}>
              {o}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(s) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: hovered(s) ? colors.green : colors.line,
      })}
    >
      <Text style={{ fontSize: 15, color: colors.ink }}>{label}</Text>
      <Ionicons name="chevron-down" size={14} color={colors.muted} />
    </Pressable>
  );
}

export function OptionCard({
  icon,
  title,
  desc,
  tag,
  onPress,
}: {
  icon: IconName;
  title: string;
  desc: string;
  tag?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(s) => [
        {
          flexGrow: 1,
          flexBasis: 240,
          padding: 20,
          borderRadius: 16,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: hovered(s) ? colors.green : colors.border,
        },
        hovered(s) ? { transform: [{ translateY: -4 }] } : null,
      ]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Ionicons name={icon} size={26} color={colors.green} />
        {tag ? (
          <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.mintTint }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.greenDark }}>{tag}</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ marginTop: 14, fontSize: 18, fontWeight: '600', color: colors.ink }}>{title}</Text>
      <Text style={{ marginTop: 4, fontSize: 15, color: colors.muted }}>{desc}</Text>
    </Pressable>
  );
}

export function Skeleton({ width }: { width: number | `${number}%` }) {
  const v = useLoop(1100, true);
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  return <Animated.View style={{ height: 14, width, borderRadius: 7, backgroundColor: colors.skeleton, opacity }} />;
}

function WaveBar({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0.35)).current;
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: native }),
        Animated.timing(v, { toValue: 0.35, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: native }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduce]);
  return (
    <Animated.View
      style={{ width: 6, height: 44, borderRadius: 3, backgroundColor: colors.greenDark, transform: [{ scaleY: v }] }}
    />
  );
}

export function Wave() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 64 }}
    >
      {[0, 120, 240, 360, 480, 600, 720].map((d) => (
        <WaveBar key={d} delay={d} />
      ))}
    </View>
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
EOF

cat > src/design/home-screen.tsx <<'EOF'
import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { Button, H1, OptionCard, Page, SectionLabel, Wave } from './ui';
import { Rise } from './motion';
import { colors } from './theme';

// WIRE: replace with the signed-in user's name
const USER_NAME = 'chill';

export type HomeProps = {
  tradeCount?: number;
  onPlan?: () => void;
  onConnect?: () => void;
  onScreenshot?: () => void;
  onMany?: () => void;
  onManual?: () => void;
};

export default function HomeScreen({ tradeCount = 0, onPlan, onConnect, onScreenshot, onMany, onManual }: HomeProps) {
  const { width } = useWindowDimensions();
  const small = width < 600;
  return (
    <Page>
      <Rise>
        <H1>Hi {USER_NAME}</H1>
      </Rise>
      <Rise delay={150}>
        <Text style={{ marginTop: 8, fontSize: 19, color: colors.muted }}>
          Log your first trade to start building your edge.
        </Text>
      </Rise>

      <Rise delay={300} style={{ marginTop: 32 }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            padding: small ? 24 : 32,
            borderRadius: 24,
            backgroundColor: colors.mint,
          }}
        >
          <View style={{ flexShrink: 1, maxWidth: 520 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onMint }}>
              Step 1 of your journal: plan it before
            </Text>
            <Text style={{ marginTop: 8, fontSize: small ? 32 : 40, fontWeight: '700', letterSpacing: -1, color: colors.onMint }}>
              Plan a trade
            </Text>
            <Text style={{ marginTop: 10, marginBottom: 18, fontSize: 18, color: colors.onMint }}>
              Say it or type it. Get it written down before you click.
            </Text>
            <Button variant="dark" icon="mic-outline" label="Start planning" onPress={onPlan} style={{ alignSelf: 'flex-start' }} />
          </View>
          <Wave />
        </View>
      </Rise>

      <Rise delay={450} style={{ marginTop: 44 }}>
        <SectionLabel>Add your trades</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
          <OptionCard icon="hardware-chip-outline" tag="Fastest" title="Connect MetaTrader" desc="Auto-sync. Closed trades arrive on their own." onPress={onConnect} />
          <OptionCard icon="image-outline" title="From a screenshot" desc="Drop one trade screenshot." onPress={onScreenshot} />
          <OptionCard icon="images-outline" title="Many from history" desc="Add several history screenshots at once." onPress={onMany} />
          <OptionCard icon="create-outline" title="By hand" desc="Type a trade in yourself." onPress={onManual} />
        </View>
      </Rise>

      {tradeCount === 0 ? (
        <Rise delay={600} style={{ marginTop: 32 }}>
          <View style={{ padding: 32, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 56 }}>
              {[22, 40, 30, 52, 34].map((h, i) => (
                <View key={i} style={{ width: 14, height: h, borderRadius: 3, backgroundColor: colors.skeleton }} />
              ))}
            </View>
            <Text style={{ marginTop: 14, fontSize: 20, fontWeight: '600', color: colors.ink }}>No trades yet</Text>
            <Text style={{ marginTop: 4, color: colors.muted, textAlign: 'center' }}>
              Connect MetaTrader and your closed trades will show up here.
            </Text>
          </View>
        </Rise>
      ) : null}
    </Page>
  );
}
EOF

cat > src/design/trades-screen.tsx <<'EOF'
import React, { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { Button, Chip, H1, Page, Segmented, Skeleton } from './ui';
import { Rise } from './motion';
import { colors } from './theme';

export type Trade = {
  id?: string | number;
  date?: string;
  pair?: string;
  direction?: string;
  setup?: string;
  mood?: string;
  result?: number;
};

export type TradesProps = {
  trades?: Trade[];
  onAdd?: () => void;
  onImport?: () => void;
};

const HEAD = ['Date', 'Pair', 'Direction', 'Setup', 'Mood', 'Result'];
const W = [1, 1.2, 1, 1.2, 1.2, 0.8];

function Row({ cells, cols, head }: { cells: React.ReactNode[]; cols: number[]; head?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 20,
        alignItems: 'center',
        paddingVertical: 18,
        paddingHorizontal: 24,
        borderTopWidth: head ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      {cols.map((c) => (
        <View key={c} style={{ flex: W[c] }}>
          {cells[c]}
        </View>
      ))}
    </View>
  );
}

export default function TradesScreen({ trades = [], onAdd, onImport }: TradesProps) {
  const { width } = useWindowDimensions();
  const cols = width < 600 ? [0, 1, 5] : [0, 1, 2, 3, 4, 5];
  const [dir, setDir] = useState('All');
  const shown = trades.filter((t) => dir === 'All' || (t.direction ?? '').toLowerCase() === dir.toLowerCase());
  const widths: (number | `${number}%`)[][] = [
    ['70%', '60%', '50%', '80%', '60%', '50%'],
    ['60%', '70%', '55%', '65%', '70%', '45%'],
    ['75%', '55%', '50%', '75%', '55%', '60%'],
    ['65%', '65%', '60%', '70%', '65%', '50%'],
  ];

  return (
    <Page>
      <Rise style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
        <View style={{ flexShrink: 1 }}>
          <H1>Trades</H1>
          <Text style={{ marginTop: 8, fontSize: 18, color: colors.muted, maxWidth: 560 }}>
            Every trade you have logged, with the mood you were in when you took it.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Button variant="secondary" label="Import" onPress={onImport} />
          <Button icon="add" label="Add trade" onPress={onAdd} />
        </View>
      </Rise>

      <Rise delay={150} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 28 }}>
        <Segmented options={['All', 'Long', 'Short']} value={dir} onChange={setDir} />
        <Chip label="All setups" />
        <Chip label="All moods" />
      </Rise>

      <Rise delay={300} style={{ marginTop: 20 }}>
        <View style={{ borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          <Row
            head
            cols={cols}
            cells={HEAD.map((h) => (
              <Text key={h} style={{ fontSize: 14, color: colors.muted }}>
                {h}
              </Text>
            ))}
          />
          {shown.length > 0
            ? shown.map((t, i) => (
                <Row
                  key={String(t.id ?? i)}
                  cols={cols}
                  cells={[
                    <Text key="a" style={{ color: colors.ink }}>{t.date ?? ''}</Text>,
                    <Text key="b" style={{ color: colors.ink, fontWeight: '600' }}>{t.pair ?? ''}</Text>,
                    <Text key="c" style={{ color: colors.ink }}>{t.direction ?? ''}</Text>,
                    <Text key="d" style={{ color: colors.ink }}>{t.setup ?? ''}</Text>,
                    <Text key="e" style={{ color: colors.ink }}>{t.mood ?? ''}</Text>,
                    <Text key="f" style={{ fontWeight: '600', color: (t.result ?? 0) >= 0 ? colors.green : colors.red }}>
                      {t.result === undefined ? '' : (t.result >= 0 ? '+' : '') + t.result}
                    </Text>,
                  ]}
                />
              ))
            : widths.map((w, r) => (
                <Row key={r} cols={cols} cells={w.map((x, i) => <Skeleton key={i} width={x} />)} />
              ))}

          {shown.length === 0 ? (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                backgroundColor: 'rgba(255,255,255,0.93)',
              }}
            >
              <Text style={{ fontSize: 28, fontWeight: '700', letterSpacing: -0.6, color: colors.ink }}>No trades yet</Text>
              <Text style={{ marginTop: 8, marginBottom: 20, fontSize: 17, color: colors.muted, textAlign: 'center', maxWidth: 460 }}>
                Log your first trade, or import the history you already have from a MetaTrader report.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
                <Button label="Add a trade" onPress={onAdd} />
                <Button variant="secondary" label="Import a report" onPress={onImport} />
              </View>
            </View>
          ) : null}
        </View>
      </Rise>
    </Page>
  );
}
EOF

cat > "src/app/(app)/_layout.tsx" <<'EOF'
import { Slot } from 'expo-router';
import { AppShell } from '../../design/shell';

// WIRE: if your old layout had an auth redirect or providers, restore them here.
// Old file: .redesign-backup/_layout.tsx.bak
export default function AppLayout() {
  return (
    <AppShell>
      <Slot />
    </AppShell>
  );
}
EOF

cat > "src/app/(app)/index.tsx" <<'EOF'
import HomeScreen from '../../design/home-screen';

// WIRE: pass tradeCount and the sheet openers from .redesign-backup/index.tsx.bak
export default function Index() {
  return <HomeScreen />;
}
EOF

cat > "src/app/(app)/trades.tsx" <<'EOF'
import TradesScreen from '../../design/trades-screen';

// WIRE: pass trades, onAdd and onImport from .redesign-backup/trades.tsx.bak
export default function Trades() {
  return <TradesScreen />;
}
EOF

echo ""
echo "Files written on branch: $(git branch --show-current)"
echo "---- type check ----"
npx tsc --noEmit 2>&1 | head -40
echo "---- done ----"
