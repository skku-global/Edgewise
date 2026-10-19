import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, native } from './theme';
import { Rise, useReducedMotion } from './motion';
import { hovered } from './ui';

export type CoachMessage = {
  id: string | number;
  role: 'user' | 'coach';
  text: string;
  trade?: { pair?: string; entry?: string; stop?: string };
};

export type CoachProps = {
  messages?: CoachMessage[];
  typing?: boolean;
  suggestions?: string[];
  greeting?: string;
  onSend?: (text: string) => void;
  onAttach?: () => void;
  onMic?: () => void;
};

function Dot({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 360, easing: Easing.inOut(Easing.ease), useNativeDriver: native }),
        Animated.timing(v, { toValue: 0, duration: 360, easing: Easing.inOut(Easing.ease), useNativeDriver: native }),
        Animated.delay(300),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduce]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.muted, opacity: 0.6, transform: [{ translateY }] }} />;
}

function Typing() {
  return (
    <View accessibilityLabel="Coach is typing" style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 5, paddingVertical: 18, paddingHorizontal: 18, borderRadius: 20, borderBottomLeftRadius: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  );
}

function IconBtn({ name, label, onPress, filled }: { name: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress?: () => void; filled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(s) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: filled ? colors.green : hovered(s) ? colors.line : colors.skeleton })}
    >
      <Ionicons name={name} size={20} color={filled ? '#FFFFFF' : colors.ink} />
    </Pressable>
  );
}

export default function CoachScreen({
  messages = [],
  typing = false,
  suggestions = ['Review my last trade', 'Plan a trade', 'What is my best setup?'],
  greeting = 'Hi. What are you looking at today?',
  onSend,
  onAttach,
  onMic,
}: CoachProps) {
  const { width } = useWindowDimensions();
  const [text, setText] = useState('');
  const scroller = useRef<ScrollView>(null);

  const send = (t: string) => {
    const v = t.trim();
    if (!v) return;
    if (onSend) onSend(v);
    setText('');
  };

  const bubble = { maxWidth: 560, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 20 } as const;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'center', paddingBottom: 24 }}
        onContentSizeChange={() => scroller.current && scroller.current.scrollToEnd({ animated: true })}
      >
        <View style={{ width: '100%', maxWidth: 760, paddingHorizontal: 20, paddingTop: 16 }}>
          <Rise>
            <Text accessibilityRole="header" style={{ fontSize: width < 600 ? 34 : 44, fontWeight: '700', letterSpacing: -1.2, color: colors.ink }}>Coach</Text>
            <Text style={{ marginTop: 8, fontSize: 18, color: colors.muted }}>Talk through a trade before or after you take it.</Text>
          </Rise>

          <View style={{ marginTop: 28, gap: 14 }}>
            <Rise delay={150}>
              <View style={[bubble, { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 }]}>
                <Text style={{ fontSize: 17, color: colors.ink }}>{greeting}</Text>
              </View>
            </Rise>
            {messages.map((m) => (
              <View
                key={String(m.id)}
                style={[
                  bubble,
                  m.role === 'user'
                    ? { alignSelf: 'flex-end', backgroundColor: colors.mint, borderBottomRightRadius: 6 }
                    : { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 },
                ]}
              >
                {m.trade ? (
                  <View style={{ flexDirection: 'row', gap: 24, padding: 12, marginBottom: 12, borderRadius: 14, backgroundColor: colors.bg }}>
                    {(['pair', 'entry', 'stop'] as const).map((k) =>
                      m.trade && m.trade[k] ? (
                        <View key={k}>
                          <Text style={{ fontSize: 13, color: colors.muted }}>{k === 'pair' ? 'Pair' : k === 'entry' ? 'Entry' : 'Stop'}</Text>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{m.trade[k]}</Text>
                        </View>
                      ) : null
                    )}
                  </View>
                ) : null}
                <Text style={{ fontSize: 17, color: m.role === 'user' ? colors.onMint : colors.ink }}>{m.text}</Text>
              </View>
            ))}
            {typing ? <Typing /> : null}
          </View>
        </View>
      </ScrollView>

      <View style={{ alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 }}>
        <View style={{ width: '100%', maxWidth: 760 }}>
          {messages.length === 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              {suggestions.map((s) => (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  onPress={() => send(s)}
                  style={(st) => ({ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: hovered(st) ? colors.green : colors.line })}
                >
                  <Text style={{ fontSize: 15, color: colors.ink }}>{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }}>
            <IconBtn name="image-outline" label="Attach a screenshot" onPress={onAttach} />
            <TextInput
              accessibilityLabel="Message Coach"
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => send(text)}
              placeholder="Type, or tap the mic"
              placeholderTextColor={colors.muted}
              returnKeyType="send"
              style={{ flex: 1, fontSize: 17, paddingVertical: 8, color: colors.ink, outlineStyle: 'none' } as never}
            />
            <IconBtn name="mic-outline" label="Speak" onPress={onMic} />
            <IconBtn name="arrow-forward" label="Send" filled onPress={() => send(text)} />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
