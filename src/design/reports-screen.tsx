import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, View, useWindowDimensions } from 'react-native';
import { Button, H1, Page, Segmented } from './ui';
import { Rise, useReducedMotion } from './motion';
import { colors, ease, native } from './theme';

export type Item = { label: string; value: number };

export type CoverageData = {
  totalTrades: number;
  withMood: number;
  moodCoveragePct: number;
  fullCoverage: number;
  partialCoverage: number;
  missingCoverage: number;
  shotCoveragePct: number;
  totalShots: number;
};

export type ReportsProps = {
  net?: number;
  winRate?: number; // 0-100
  profitFactor?: number;
  growth?: number[]; // account balance over time
  bySetup?: Item[];
  byMood?: Item[];
  byMethod?: Item[];
  coverage?: CoverageData;
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
    Animated.timing(v, { toValue: 1, duration: reduce ? 100 : 240, delay: reduce ? 0 : Math.min(delay, 120) * 0.25, easing: ease, useNativeDriver: native }).start();
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
    Animated.timing(v, { toValue: 1, duration: 400, delay: 100, easing: ease, useNativeDriver: false }).start();
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

export default function ReportsScreen({ net, winRate, profitFactor, growth = [], bySetup = [], byMood = [],
  byMethod = [], coverage, insight, onTalk, onRangeChange }: ReportsProps) {
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
        <Rows title="How you log" items={byMethod} />
      </Rise>

      {coverage && coverage.totalTrades > 0 ? (
        <Rise delay={500} style={{ marginTop: 20 }}>
          <View style={{ padding: 24, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.muted, marginBottom: 16 }}>
              Discipline & Coverage
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
              {/* Mood Coverage */}
              <View style={{ flexGrow: 1, flexBasis: 280 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Mood Coverage</Text>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: colors.green }}>
                    {coverage.moodCoveragePct}%
                  </Text>
                </View>
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>
                  {coverage.withMood} of {coverage.totalTrades} trades logged with emotional state
                </Text>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.skeleton, marginTop: 10, overflow: 'hidden' }}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.green, width: `${coverage.moodCoveragePct}%` }} />
                </View>
              </View>

              {/* Screenshot Coverage */}
              <View style={{ flexGrow: 1, flexBasis: 280 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Screenshot Coverage</Text>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: coverage.shotCoveragePct >= 80 ? colors.green : colors.mint }}>
                    {coverage.shotCoveragePct}%
                  </Text>
                </View>
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>
                  {coverage.fullCoverage} full (≥2 shots) • {coverage.partialCoverage} partial (1) • {coverage.missingCoverage} none
                </Text>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.skeleton, marginTop: 10, overflow: 'hidden' }}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.mint, width: `${coverage.shotCoveragePct}%` }} />
                </View>
              </View>
            </View>
          </View>
        </Rise>
      ) : null}

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
