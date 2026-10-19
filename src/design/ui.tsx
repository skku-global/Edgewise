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
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ alignItems: 'center', paddingBottom: 120 }}>
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
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.tagText }}>{tag}</Text>
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
