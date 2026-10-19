#!/usr/bin/env bash
set +H
cd "$(dirname "$0")" || exit 1

echo "Branch: $(git branch --show-current)"
mkdir -p .redesign-backup src/design
cp "src/app/(app)/calendar.tsx" .redesign-backup/calendar.tsx.bak
cp "src/app/(app)/reports.tsx" .redesign-backup/reports.tsx.bak
cp "src/app/(app)/chat.tsx" .redesign-backup/chat.tsx.bak

cat > src/design/calendar-screen.tsx <<'EOF'
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, H1, Page, hovered } from './ui';
import { Rise, useReducedMotion } from './motion';
import { colors, ease, native } from './theme';

export type CalendarProps = {
  // 'YYYY-MM-DD' -> day result
  results?: Record<string, number>;
  moods?: Record<string, string>;
  onOpenDay?: (dateKey: string) => void;
  onMonthChange?: (year: number, month: number) => void;
};

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => (n < 10 ? '0' : '') + n;
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
// WIRE: change '$' if your results use another currency
const money = (r: number) => (r >= 0 ? '+' : '-') + '$' + Math.abs(r).toLocaleString('en-US');

function Bar({ h, color, delay }: { h: number; color: string; delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  const reduce = useReducedMotion();
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: reduce ? 150 : 700, delay: reduce ? 0 : delay, easing: ease, useNativeDriver: native }).start();
  }, []);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [h / 2, 0] });
  return (
    <Animated.View
      style={{ height: h, borderRadius: 4, backgroundColor: color, opacity: reduce ? v : 1, transform: reduce ? [] : [{ translateY }, { scaleY: v }] }}
    />
  );
}

export default function CalendarScreen({ results = {}, moods = {}, onOpenDay, onMonthChange }: CalendarProps) {
  const { width } = useWindowDimensions();
  const small = width < 600;
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [sel, setSel] = useState<string | null>(keyOf(now.getFullYear(), now.getMonth(), now.getDate()));

  const go = (delta: number) => {
    const d = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
    setSel(null);
    if (onMonthChange) onMonthChange(d.getFullYear(), d.getMonth());
  };

  const first = new Date(ym.y, ym.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const total = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const vals = Object.keys(results)
    .filter((k) => k.startsWith(`${ym.y}-${pad(ym.m + 1)}`))
    .map((k) => Math.abs(results[k]));
  const max = vals.length ? Math.max(...vals, 1) : 1;
  const cellH = small ? 64 : 92;
  const todayKey = keyOf(now.getFullYear(), now.getMonth(), now.getDate());

  const selDate = sel ? new Date(Number(sel.slice(0, 4)), Number(sel.slice(5, 7)) - 1, Number(sel.slice(8, 10))) : null;
  const selResult = sel ? results[sel] : undefined;

  return (
    <Page>
      <Rise style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <View style={{ flexShrink: 1 }}>
          <H1>Calendar</H1>
          <Text style={{ marginTop: 8, fontSize: 18, color: colors.muted }}>Your month at a glance. Each bar is one day's result.</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={() => go(-1)}
            style={(s) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: hovered(s) ? colors.green : colors.line })}
          >
            <Ionicons name="chevron-back" size={18} color={colors.ink} />
          </Pressable>
          <Text style={{ minWidth: 150, textAlign: 'center', fontSize: 20, fontWeight: '700', color: colors.ink }}>
            {MONTHS[ym.m]} {ym.y}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={() => go(1)}
            style={(s) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: hovered(s) ? colors.green : colors.line })}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.ink} />
          </Pressable>
        </View>
      </Rise>

      <Rise delay={150} style={{ marginTop: 28 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {WEEK.map((w) => (
            <Text key={w} style={{ flex: 1, fontSize: 14, color: colors.muted, paddingHorizontal: 4 }}>{w}</Text>
          ))}
        </View>
      </Rise>

      <Rise delay={300} style={{ marginTop: 8, gap: 10 }}>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: 10 }}>
            {row.map((d, ci) => {
              if (d === null) return <View key={ci} style={{ flex: 1, height: cellH }} />;
              const k = keyOf(ym.y, ym.m, d);
              const r = results[k];
              const isToday = k === todayKey;
              const isSel = k === sel;
              const h = r === undefined ? 0 : 10 + Math.round((Math.abs(r) / max) * (cellH - 44));
              return (
                <Pressable
                  key={ci}
                  accessibilityRole="button"
                  accessibilityLabel={`${d} ${MONTHS[ym.m]}${r === undefined ? '' : ', ' + money(r)}`}
                  onPress={() => setSel(k)}
                  style={(s) => [
                    {
                      flex: 1,
                      height: cellH,
                      padding: small ? 6 : 10,
                      borderRadius: 14,
                      justifyContent: 'space-between',
                      backgroundColor: colors.card,
                      borderWidth: isToday || isSel ? 2 : 1,
                      borderColor: isToday || isSel || hovered(s) ? colors.green : colors.border,
                    },
                    hovered(s) ? { transform: [{ translateY: -3 }] } : null,
                  ]}
                >
                  <Text style={{ fontSize: 14, color: isToday ? colors.green : colors.muted, fontWeight: isToday ? '600' : '400' }}>{d}</Text>
                  {r !== undefined ? <Bar h={h} color={r >= 0 ? colors.green : colors.red} delay={ri * 90 + ci * 40} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </Rise>

      {selDate ? (
        <Rise delay={450} style={{ marginTop: 20 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: 20, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <View>
              <Text style={{ fontSize: 14, color: colors.muted }}>
                {DAYS[selDate.getDay()]} {selDate.getDate()} {MONTHS[selDate.getMonth()].slice(0, 3)}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 28, fontWeight: '700', letterSpacing: -0.6, color: selResult === undefined ? colors.muted : selResult >= 0 ? colors.green : colors.red }}>
                {selResult === undefined ? 'No trades' : money(selResult)}
              </Text>
              {sel && moods[sel] ? <Text style={{ marginTop: 2, color: colors.muted }}>Mood: {moods[sel]}</Text> : null}
            </View>
            <Button label="Open this day" onPress={() => sel && onOpenDay && onOpenDay(sel)} />
          </View>
        </Rise>
      ) : null}
    </Page>
  );
}
EOF

cat > src/design/reports-screen.tsx <<'EOF'
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, View, useWindowDimensions } from 'react-native';
import { Button, H1, Page, Segmented } from './ui';
import { Rise, useReducedMotion } from './motion';
import { colors, ease, native } from './theme';

export type Item = { label: string; value: number };

export type ReportsProps = {
  net?: number;
  winRate?: number; // 0-100
  profitFactor?: number;
  growth?: number[]; // account balance over time
  bySetup?: Item[];
  byMood?: Item[];
  insight?: string;
  onTalk?: () => void;
  onRangeChange?: (range: string) => void;
};

// WIRE: change '$' if your results use another currency
const money = (r: number) => (r >= 0 ? '+' : '-') + '$' + Math.abs(r).toLocaleString('en-US');

function GrowBar({ h, last, delay }: { h: number; last: boolean; delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  const reduce = useReducedMotion();
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: reduce ? 150 : 800, delay: reduce ? 0 : delay, easing: ease, useNativeDriver: native }).start();
  }, []);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [h / 2, 0] });
  return (
    <Animated.View
      style={{ flex: 1, height: h, borderRadius: 4, backgroundColor: last ? colors.mint : colors.green, opacity: reduce ? v : 1, transform: reduce ? [] : [{ translateY }, { scaleY: v }] }}
    />
  );
}

function Rows({ title, items }: { title: string; items: Item[] }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 900, delay: 500, easing: ease, useNativeDriver: false }).start();
  }, []);
  return (
    <View style={{ flexGrow: 1, flexBasis: 320, padding: 24, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.muted, marginBottom: 8 }}>{title}</Text>
      {items.length === 0 ? <Text style={{ color: colors.muted }}>Nothing to show yet.</Text> : null}
      {items.map((it) => {
        const pct = Math.max(8, Math.round((Math.abs(it.value) / max) * 100));
        const width = v.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${pct}%`] });
        const c = it.value >= 0 ? colors.green : colors.red;
        return (
          <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 }}>
            <Text style={{ width: 96, fontSize: 16, color: colors.ink }}>{it.label}</Text>
            <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.skeleton, overflow: 'hidden' }}>
              <Animated.View style={{ height: 10, borderRadius: 5, backgroundColor: c, width }} />
            </View>
            <Text style={{ width: 76, textAlign: 'right', fontSize: 16, fontWeight: '600', color: c }}>{money(it.value)}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function ReportsScreen({ net, winRate, profitFactor, growth = [], bySetup = [], byMood = [], insight, onTalk, onRangeChange }: ReportsProps) {
  const { width } = useWindowDimensions();
  const big = width < 600 ? 44 : 60;
  const [range, setRange] = useState('30 days');
  const stat = (label: string, value: string, color?: string) => (
    <View style={{ flexGrow: 1, flexBasis: 200 }}>
      <Text style={{ fontSize: big, fontWeight: '700', letterSpacing: -2, color: color ?? colors.ink }}>{value}</Text>
      <Text style={{ marginTop: 4, color: colors.muted }}>{label}</Text>
    </View>
  );
  const lo = growth.length ? Math.min(...growth) : 0;
  const hi = growth.length ? Math.max(...growth) : 1;

  return (
    <Page>
      <Rise style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <View style={{ flexShrink: 1 }}>
          <H1>Reports</H1>
          <Text style={{ marginTop: 8, fontSize: 18, color: colors.muted }}>What is working, and what is not.</Text>
        </View>
        <Segmented
          options={['7 days', '30 days', '90 days', 'All']}
          value={range}
          onChange={(r) => {
            setRange(r);
            if (onRangeChange) onRangeChange(r);
          }}
        />
      </Rise>

      <Rise delay={150} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 28, marginTop: 32 }}>
        {stat('Net result', net === undefined ? '-' : money(net), net === undefined ? undefined : net >= 0 ? colors.green : colors.red)}
        {stat('Win rate', winRate === undefined ? '-' : `${Math.round(winRate)}%`)}
        {stat('Profit factor', profitFactor === undefined ? '-' : profitFactor.toFixed(1))}
      </Rise>

      <Rise delay={300} style={{ marginTop: 28 }}>
        <View style={{ padding: 24, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.muted, marginBottom: 12 }}>Account growth</Text>
          {growth.length === 0 ? (
            <Text style={{ color: colors.muted, paddingVertical: 40, textAlign: 'center' }}>Your growth will appear here once you log trades.</Text>
          ) : (
            <View accessibilityLabel="Account growth bars" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 180 }}>
              {growth.map((g, i) => (
                <GrowBar key={i} h={24 + Math.round(((g - lo) / Math.max(1, hi - lo)) * 150)} last={i === growth.length - 1} delay={i * 25} />
              ))}
            </View>
          )}
        </View>
      </Rise>

      <Rise delay={450} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 20 }}>
        <Rows title="By setup" items={bySetup} />
        <Rows title="By mood" items={byMood} />
      </Rise>

      {insight ? (
        <Rise delay={600} style={{ marginTop: 20 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: 20, borderRadius: 18, backgroundColor: colors.mintTint }}>
            <Text style={{ flexShrink: 1, maxWidth: 640, fontSize: 18, color: colors.onMint }}>
              <Text style={{ fontWeight: '700' }}>Coach noticed: </Text>
              {insight}
            </Text>
            <Button variant="dark" label="Talk it through" onPress={onTalk} />
          </View>
        </Rise>
      ) : null}
    </Page>
  );
}
EOF

cat > src/design/coach-screen.tsx <<'EOF'
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
EOF

cat > "src/app/(app)/calendar.tsx" <<'EOF'
import CalendarScreen from '../../design/calendar-screen';

// WIRE: pass results ('YYYY-MM-DD' -> day result), moods, onOpenDay, onMonthChange
// from .redesign-backup/calendar.tsx.bak
export default function Calendar() {
  return <CalendarScreen />;
}
EOF

cat > "src/app/(app)/reports.tsx" <<'EOF'
import ReportsScreen from '../../design/reports-screen';

// WIRE: pass net, winRate, profitFactor, growth, bySetup, byMood, insight
// from .redesign-backup/reports.tsx.bak
export default function Reports() {
  return <ReportsScreen />;
}
EOF

echo ""
echo "calendar.tsx and reports.tsx now use the new designs."
echo "chat.tsx is NOT replaced (it holds your AI logic). Run:  cat \"src/app/(app)/chat.tsx\"  and paste it here to wire coach-screen.tsx."
echo "---- type check ----"
npx tsc --noEmit 2>&1 | head -40
echo "---- done ----"
