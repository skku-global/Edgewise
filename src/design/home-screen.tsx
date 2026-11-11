/**
 * Home. Three jobs, in the order a trader needs them:
 *
 *   1. Trades in flight — a plan you wrote this morning, a position you are in
 *      now. This is the journal's whole point (before → during → after), and it
 *      is useless if the "during" and "after" halves cannot be reached. This
 *      list is the way back in.
 *   2. Ways to add a trade: the full journal, broker sync / report import, and
 *      the AI screenshot reader.
 *   3. What the last 30 days look like, and the latest trades, so the home page
 *      says something once there is history.
 *
 * Presentational: every number and callback arrives through props, so the
 * screen can be rendered with fixtures and the data layer stays in the route.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { Button, H1, OptionCard, Page, SectionLabel, hovered } from './ui';
import { Rise } from './motion';
import { colors } from './theme';

export type OpenPlan = {
  id: number;
  pair: string;
  direction: 'buy' | 'sell';
  status: 'planned' | 'open';
  grade: string | null;
  checkins: number;
  /** Already formatted, e.g. "2h ago". */
  started: string;
};

export type RecentTrade = {
  id: number;
  pair: string;
  direction: 'buy' | 'sell';
  /** Signed, already rounded. */
  result: number;
  /** Already formatted, e.g. "Nov 9". */
  date: string;
  /** True when a journal entry (plan / check-ins / review) is attached. */
  journaled: boolean;
};

export type HomeStats = {
  net: number;
  /** 0–100. */
  winRate: number;
  count: number;
};

export type HomeProps = {
  tradeCount?: number;
  userName?: string;
  openPlans?: OpenPlan[];
  recent?: RecentTrade[];
  /** Last-30-day figures. Omit when there are no trades in that window. */
  stats?: HomeStats | null;
  onManual?: () => void;
  onAuto?: () => void;
  onScreenshots?: () => void;
  onOpenPlan?: (id: number) => void;
  onOpenTrade?: (id: number) => void;
  onSeeAllTrades?: () => void;
};

const money = (r: number) => (r >= 0 ? '+' : '-') + '$' + Math.abs(r).toLocaleString('en-US');

function Tag({ label, tone = 'neutral' }: { label: string; tone?: 'gain' | 'loss' | 'neutral' | 'mint' }) {
  const bg =
    tone === 'gain' ? colors.mintTint : tone === 'loss' ? '#F6E3E1' : tone === 'mint' ? colors.mint : colors.skeleton;
  const fg = tone === 'gain' ? colors.greenDark : tone === 'loss' ? colors.red : tone === 'mint' ? colors.onMint : colors.muted;
  return (
    <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.3, color: fg }}>{label}</Text>
    </View>
  );
}

function PlanRow({ plan, onPress, first }: { plan: OpenPlan; onPress?: () => void; first: boolean }) {
  const dir = plan.direction === 'buy' ? 'LONG' : 'SHORT';
  const stage = plan.status === 'open' ? 'In the trade' : 'Planned, not entered';
  const meta = [
    plan.started,
    plan.checkins > 0 ? `${plan.checkins} check-in${plan.checkins === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Continue ${plan.pair} ${dir}, ${stage}`}
      onPress={onPress}
      style={(s) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
        backgroundColor: hovered(s) ? colors.skeleton : 'transparent',
      })}
    >
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: plan.status === 'open' ? colors.green : colors.line,
        }}
      />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>{plan.pair}</Text>
          <Tag label={dir} tone={plan.direction === 'buy' ? 'gain' : 'loss'} />
          {plan.grade && plan.grade !== 'Draft' ? <Tag label={`Grade ${plan.grade}`} tone="mint" /> : null}
        </View>
        <Text style={{ fontSize: 14, color: colors.muted }}>
          {stage}
          {meta ? ` · ${meta}` : ''}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.green }}>
          {plan.status === 'open' ? 'Check in' : 'Continue'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.green} />
      </View>
    </Pressable>
  );
}

function TradeRow({ trade, onPress, first }: { trade: RecentTrade; onPress?: () => void; first: boolean }) {
  const up = trade.result >= 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${trade.pair} ${trade.direction === 'buy' ? 'long' : 'short'}, ${money(trade.result)}`}
      onPress={onPress}
      style={(s) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
        backgroundColor: hovered(s) ? colors.skeleton : 'transparent',
      })}
    >
      <Text style={{ width: 56, fontSize: 14, color: colors.muted }}>{trade.date}</Text>
      <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.ink }}>{trade.pair}</Text>
      <Tag label={trade.direction === 'buy' ? 'LONG' : 'SHORT'} />
      {trade.journaled ? (
        <Ionicons name="book-outline" size={16} color={colors.muted} accessibilityLabel="Journaled" />
      ) : (
        <View style={{ width: 16 }} />
      )}
      <Text style={{ width: 84, textAlign: 'right', fontSize: 16, fontWeight: '700', color: up ? colors.green : colors.red }}>
        {money(trade.result)}
      </Text>
    </Pressable>
  );
}

export default function HomeScreen({
  tradeCount = 0,
  userName = 'Trader',
  openPlans = [],
  recent = [],
  stats = null,
  onManual,
  onAuto,
  onScreenshots,
  onOpenPlan,
  onOpenTrade,
  onSeeAllTrades,
}: HomeProps) {
  const { width } = useWindowDimensions();
  const small = width < 600;
  const big = small ? 32 : 40;

  const card = {
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden' as const,
  };

  let step = 0;
  const next = () => (step += 1) * 120;

  return (
    <Page>
      <Rise>
        <H1>Hi {userName}</H1>
      </Rise>
      <Rise delay={next()}>
        <Text style={{ marginTop: 8, fontSize: 19, color: colors.muted }}>
          {openPlans.length > 0
            ? `You have ${openPlans.length} trade${openPlans.length === 1 ? '' : 's'} in flight.`
            : 'Log your trades with discipline, psychology, and evidence.'}
        </Text>
      </Rise>

      {openPlans.length > 0 ? (
        <Rise delay={next()} style={{ marginTop: 32 }}>
          <SectionLabel>In progress</SectionLabel>
          <View style={[card, { marginTop: 14 }]}>
            {openPlans.map((plan, i) => (
              <PlanRow key={plan.id} plan={plan} first={i === 0} onPress={() => onOpenPlan?.(plan.id)} />
            ))}
          </View>
        </Rise>
      ) : null}

      <Rise delay={next()} style={{ marginTop: 32 }}>
        <SectionLabel>Add or import trades</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 14 }}>
          <OptionCard
            icon="create-outline"
            tag="Full flow"
            title="Journal a trade"
            desc="Plan it before, check in during, review it after — with screenshots as evidence."
            onPress={onManual}
          />
          <OptionCard
            icon="hardware-chip-outline"
            tag="Auto"
            title="MetaTrader & reports"
            desc="Live sync from MetaTrader, or import your MT5 statement HTML."
            onPress={onAuto}
          />
          <OptionCard
            icon="images-outline"
            tag="AI reads it"
            title="From screenshots"
            desc="Pick up to six history screenshots. The AI reads the trades; you tick the ones to keep."
            onPress={onScreenshots}
          />
        </View>
      </Rise>

      <Rise delay={next()} style={{ marginTop: 28 }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            padding: small ? 20 : 28,
            borderRadius: 20,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexShrink: 1, maxWidth: 560 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.green }}>
              Evidence-based journaling
            </Text>
            <Text style={{ marginTop: 6, fontSize: small ? 22 : 26, fontWeight: '700', letterSpacing: -0.5, color: colors.ink }}>
              Before • During • After
            </Text>
            <Text style={{ marginTop: 6, fontSize: 15, color: colors.muted }}>
              A journaled trade needs an entry and an exit screenshot to close. Speak, type, or attach charts to keep your log honest.
            </Text>
          </View>
          <Button variant="primary" icon="add" label="Start a trade" onPress={onManual} />
        </View>
      </Rise>

      {tradeCount === 0 ? (
        <Rise delay={next()} style={{ marginTop: 32 }}>
          <View style={{ padding: 32, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 56 }}>
              {[22, 40, 30, 52, 34].map((h, i) => (
                <View key={i} style={{ width: 14, height: h, borderRadius: 3, backgroundColor: colors.skeleton }} />
              ))}
            </View>
            <Text style={{ marginTop: 14, fontSize: 20, fontWeight: '600', color: colors.ink }}>No closed trades yet</Text>
            <Text style={{ marginTop: 4, color: colors.muted, textAlign: 'center' }}>
              Journal a trade or connect MetaTrader, and your results and insights will appear here.
            </Text>
          </View>
        </Rise>
      ) : (
        <>
          <Rise delay={next()} style={{ marginTop: 32 }}>
            <SectionLabel>Last 30 days</SectionLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginTop: 14 }}>
              {stats ? (
                <>
                  <View style={{ flexGrow: 1, flexBasis: 160 }}>
                    <Text style={{ fontSize: big, fontWeight: '700', letterSpacing: -1.5, color: stats.net >= 0 ? colors.green : colors.red }}>
                      {money(stats.net)}
                    </Text>
                    <Text style={{ marginTop: 2, color: colors.muted }}>Net result</Text>
                  </View>
                  <View style={{ flexGrow: 1, flexBasis: 160 }}>
                    <Text style={{ fontSize: big, fontWeight: '700', letterSpacing: -1.5, color: colors.ink }}>
                      {Math.round(stats.winRate)}%
                    </Text>
                    <Text style={{ marginTop: 2, color: colors.muted }}>Win rate</Text>
                  </View>
                  <View style={{ flexGrow: 1, flexBasis: 160 }}>
                    <Text style={{ fontSize: big, fontWeight: '700', letterSpacing: -1.5, color: colors.ink }}>{stats.count}</Text>
                    <Text style={{ marginTop: 2, color: colors.muted }}>Trades</Text>
                  </View>
                </>
              ) : (
                <Text style={{ fontSize: 16, color: colors.muted }}>
                  Nothing closed in the last 30 days. Your older history is under Trades and Reports.
                </Text>
              )}
            </View>
          </Rise>

          {recent.length > 0 ? (
            <Rise delay={next()} style={{ marginTop: 28 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <SectionLabel>Recent trades</SectionLabel>
                <Pressable accessibilityRole="link" onPress={onSeeAllTrades} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.green }}>All trades</Text>
                  <Ionicons name="arrow-forward" size={15} color={colors.green} />
                </Pressable>
              </View>
              <View style={[card, { marginTop: 14 }]}>
                {recent.map((trade, i) => (
                  <TradeRow key={trade.id} trade={trade} first={i === 0} onPress={() => onOpenTrade?.(trade.id)} />
                ))}
              </View>
            </Rise>
          ) : null}
        </>
      )}
    </Page>
  );
}
