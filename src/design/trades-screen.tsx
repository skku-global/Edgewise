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
