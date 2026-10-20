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
          <Text style={{ marginTop: 8, fontSize: 18, color: colors.muted }}>{"Your month at a glance. Each bar is one day's result."}</Text>
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
