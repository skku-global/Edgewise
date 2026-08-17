/**
 * Reports — the analytics screen.
 *
 * The dashboard answers "how am I doing"; this answers "why". It is where the
 * numbers that need more than a glance live: profit factor, expectancy, the
 * shape of the drawdown, and which pairs, setups, weekdays and moods are
 * actually carrying the account.
 *
 * Every figure is computed from the same `useTrades` rows the other screens use
 * and derived in `@/lib/trade-stats`, so nothing here can disagree with the
 * dashboard about what a win is. The one number that appears on both screens —
 * win rate — is defined identically in both places on purpose; see the note at
 * the top of `trade-stats.ts`.
 */

import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DailyPlChart, MAX_VISIBLE_BARS } from '@/components/charts/daily-pl';
import { ThemedText } from '@/components/themed-text';
import { Card, Divider, SectionHeader } from '@/components/ui/card';
import { Dropdown } from '@/components/ui/dropdown';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { Stat, toneFor } from '@/components/ui/stat';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import type { Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTrades } from '@/hooks/use-trades';
import {
  asRangeKey,
  DEFAULT_RANGE,
  RANGE_OPTIONS,
  rangeLabel,
  withinRange,
  type RangeKey,
} from '@/lib/date-range';
import { formatAmount, formatRatio, formatSigned } from '@/lib/format';
import { displaySetup } from '@/lib/setup-types';
import { useThemedStyles } from '@/lib/styles';
import {
  breakdownBy,
  breakdownByWeekday,
  buildDailySeries,
  computeStats,
  type Breakdown,
  type CoreStats,
} from '@/lib/trade-stats';

/** Below this many trades in a group, its win rate is noise not a finding. */
const MIN_GROUP_TRADES = 3;

/**
 * "3 wins" / "1 loss" / "2 losses".
 *
 * Spelled out rather than assembled from a noun and an `es` suffix, which is how
 * the screen previously reported a three-trade run as "3 wines".
 */
function streakLabel(streak: CoreStats['currentStreak']): string {
  if (streak.kind === 'none') {
    return '—';
  }

  const noun =
    streak.kind === 'win'
      ? streak.length === 1
        ? 'win'
        : 'wins'
      : streak.length === 1
        ? 'loss'
        : 'losses';

  return `${streak.length} ${noun}`;
}

export default function ReportsScreen() {
  const { trades, loading, refreshing, error, refresh } = useTrades();
  const styles = useThemedStyles(sheet);
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);

  // One clock reading per render, passed down, rather than each helper calling
  // `new Date()` and landing either side of a midnight boundary.
  const scoped = useMemo(() => withinRange(trades, range, new Date()), [trades, range]);

  const stats = useMemo(() => computeStats(scoped), [scoped]);

  const bars = useMemo(() => {
    const series = buildDailySeries(scoped);
    // Newest bars are the interesting ones, so a long history keeps its tail.
    return series.slice(-MAX_VISIBLE_BARS).map((day) => ({ key: day.key, pl: day.pl }));
  }, [scoped]);

  const byPair = useMemo(
    () => breakdownBy(scoped, (trade) => [trade.pair.toUpperCase()]),
    [scoped],
  );

  const bySetup = useMemo(
    () =>
      breakdownBy(scoped, (trade) =>
        trade.setup_type?.trim() ? [displaySetup(trade.setup_type)] : [],
      ),
    [scoped],
  );

  const byWeekday = useMemo(() => breakdownByWeekday(scoped), [scoped]);

  const byMood = useMemo(
    () =>
      breakdownBy(scoped, (trade) => [
        // A trade tagged with the same mood twice must not count twice.
        ...new Set(trade.moods.map((mood) => mood.toLowerCase())),
      ]),
    [scoped],
  );

  const dayCount = useMemo(() => buildDailySeries(scoped).length, [scoped]);

  const riskRows: RiskRow[] = [
    { label: 'Average win', value: formatAmount(stats.averageWin), tone: 'gain' },
    { label: 'Average loss', value: formatAmount(stats.averageLoss), tone: 'loss' },
    {
      label: 'Win / loss ratio',
      value: formatRatio(stats.winLossRatio),
      note: stats.winLossRatio === null ? 'no losses to compare against' : undefined,
    },
    { label: 'Largest win', value: formatAmount(stats.largestWin), tone: 'gain' },
    { label: 'Largest loss', value: formatAmount(stats.largestLoss), tone: 'loss' },
    {
      label: 'Max drawdown',
      value: formatAmount(stats.maxDrawdown),
      tone: stats.maxDrawdown > 0 ? 'loss' : 'text',
      note: 'deepest fall from a high in cumulative P/L',
    },
    { label: 'Longest win streak', value: `${stats.longestWinStreak}` },
    { label: 'Longest losing streak', value: `${stats.longestLossStreak}` },
    {
      label: 'Current streak',
      value: streakLabel(stats.currentStreak),
      tone:
        stats.currentStreak.kind === 'win'
          ? 'gain'
          : stats.currentStreak.kind === 'loss'
            ? 'loss'
            : 'text',
    },
  ];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ScreenHeader
        title="Reports"
        subtitle="The numbers behind the win rate — what is making money, and what only feels like it is."
      />

      <View style={styles.filterRow}>
        <Dropdown
          compact
          value={range}
          options={RANGE_OPTIONS}
          onChange={(value) => setRange(asRangeKey(value))}
          placeholder="All time"
          testID="range-filter"
        />
        {/* Says what the filter did, so a thin report reads as a narrow range
            rather than a missing history. */}
        <ThemedText variant="caption" tone="textTertiary" style={styles.filterNote}>
          {scoped.length} of {trades.length} {trades.length === 1 ? 'trade' : 'trades'}
        </ThemedText>
      </View>

      {loading ? (
        <LoadingState label="Crunching your history…" />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : scoped.length === 0 ? (
        <EmptyState
          title="Nothing to report yet"
          body={
            trades.length === 0
              ? 'Log a few trades and this screen will fill in.'
              : `No trades in the ${rangeLabel(range)}. Try a wider range.`
          }
        />
      ) : (
        <>
          <View style={styles.tileRow}>
            <Stat
              label="Net P/L"
              value={formatSigned(stats.netPl)}
              tone={toneFor(stats.netPl)}
              caption={`${stats.trades} ${stats.trades === 1 ? 'trade' : 'trades'} over ${dayCount} ${
                dayCount === 1 ? 'day' : 'days'
              }`}
            />
            <Stat
              label="Profit factor"
              value={formatRatio(stats.profitFactor)}
              tone={
                stats.profitFactor === null ? 'text' : stats.profitFactor >= 1 ? 'gain' : 'loss'
              }
              caption={
                stats.profitFactor === null ? 'No losing trades yet' : 'Gross profit ÷ gross loss'
              }
            />
          </View>

          <View style={styles.tileRow}>
            <Stat
              label="Win rate"
              value={`${stats.winRate.toFixed(0)}%`}
              caption={`${stats.wins} won · ${stats.losses} lost${
                stats.scratches > 0 ? ` · ${stats.scratches} flat` : ''
              }`}
            />
            <Stat
              label="Expectancy"
              value={formatSigned(stats.expectancy)}
              tone={toneFor(stats.expectancy)}
              caption="Expected P/L per trade"
            />
          </View>

          <View>
            <SectionHeader
              title="Daily net P/L"
              subtitle="One bar per trading day. Days off are skipped, so a gap means no trades rather than a flat one."
            />
            <Card>
              <DailyPlChart bars={bars} testID="daily-pl-chart" />
            </Card>
          </View>

          <View>
            <SectionHeader title="Risk profile" subtitle="How the wins and losses are shaped." />
            <Card>
              {riskRows.map((row, index) => (
                <RiskLine key={row.label} row={row} last={index === riskRows.length - 1} />
              ))}
            </Card>
          </View>

          <BreakdownCard
            title="By pair"
            subtitle="Best net P/L first."
            rows={byPair}
            testID="breakdown-pair"
          />

          <BreakdownCard
            title="By setup"
            subtitle="Trades with no setup logged are left out rather than lumped together."
            rows={bySetup}
            emptyLabel="No setups logged in this range yet."
            testID="breakdown-setup"
          />

          <BreakdownCard
            title="By day of week"
            subtitle="Monday first, so the shape of your week stays readable."
            rows={byWeekday}
            testID="breakdown-weekday"
          />

          <BreakdownCard
            title="By mood"
            subtitle="A trade tagged with two moods counts toward both, so these can add up to more than your trade count."
            rows={byMood}
            emptyLabel="No moods logged in this range yet. Tag a few trades to see this."
            testID="breakdown-mood"
          />
        </>
      )}
    </Screen>
  );
}

type RiskRow = {
  label: string;
  value: string;
  tone?: 'gain' | 'loss' | 'text';
  note?: string;
};

function RiskLine({ row, last }: { row: RiskRow; last: boolean }) {
  const styles = useThemedStyles(sheet);

  return (
    <>
      <View style={styles.statLine}>
        <View style={styles.statLabel}>
          <ThemedText variant="body" tone="textSecondary">
            {row.label}
          </ThemedText>
          {row.note ? (
            <ThemedText variant="caption" tone="textTertiary">
              {row.note}
            </ThemedText>
          ) : null}
        </View>
        {/* Mono so the column of figures lines up on the decimal point. */}
        <ThemedText variant="mono" tone={row.tone ?? 'text'} style={styles.statValue}>
          {row.value}
        </ThemedText>
      </View>
      {last ? null : <Divider />}
    </>
  );
}

/**
 * One breakdown group per row, with a bar scaled against the largest absolute
 * net P/L in the same card.
 *
 * The bar is the point: a column of numbers has to be read and compared, while
 * the relative length of nine bars is one glance. It is scaled per card rather
 * than globally, so "by mood" is not flattened into invisibility by a pair that
 * happens to trade ten times as much.
 */
function BreakdownCard({
  title,
  subtitle,
  rows,
  emptyLabel = 'Nothing to show in this range.',
  testID,
}: {
  title: string;
  subtitle: string;
  rows: Breakdown[];
  emptyLabel?: string;
  testID?: string;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);

  // Guarded at 1: an all-flat set would otherwise divide by zero.
  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.netPl)), 1);

  return (
    <View>
      <SectionHeader title={title} subtitle={subtitle} />
      <Card testID={testID}>
        {rows.length === 0 ? (
          <ThemedText variant="body" tone="textTertiary">
            {emptyLabel}
          </ThemedText>
        ) : (
          rows.map((row, index) => (
            <View key={row.label}>
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownTop}>
                  <ThemedText
                    variant="bodyStrong"
                    numberOfLines={1}
                    style={styles.breakdownLabel}
                  >
                    {row.label}
                  </ThemedText>
                  <ThemedText variant="mono" tone={toneFor(row.netPl)}>
                    {formatSigned(row.netPl)}
                  </ThemedText>
                </View>

                <View style={styles.breakdownBottom}>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.trackFill,
                        {
                          width: barWidth(row.netPl, maxAbs),
                          backgroundColor:
                            row.netPl >= 0 ? theme.color.gain : theme.color.loss,
                        },
                      ]}
                    />
                  </View>
                  <ThemedText variant="caption" tone="textTertiary">
                    {row.trades} {row.trades === 1 ? 'trade' : 'trades'}
                    {/* A win rate off one or two trades is a coin flip with a
                        percentage sign, so it is withheld rather than printed as
                        if it meant something. */}
                    {row.trades >= MIN_GROUP_TRADES ? ` · ${row.winRate.toFixed(0)}%` : ''}
                  </ThemedText>
                </View>
              </View>
              {index === rows.length - 1 ? null : <Divider />}
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

/** Percentage width for a breakdown bar, with a visible floor for small values. */
function barWidth(netPl: number, maxAbs: number): `${number}%` {
  if (netPl === 0) {
    return '0%';
  }

  const share = (Math.abs(netPl) / maxAbs) * 100;

  return `${Math.max(3, Math.round(share))}%`;
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.two,
    },
    filterNote: {
      flexShrink: 1,
    },
    tileRow: {
      flexDirection: 'row',
      gap: t.space.three,
    },
    statLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.three,
      paddingVertical: t.space.two,
    },
    statLabel: {
      flexShrink: 1,
      gap: t.space.half,
    },
    statValue: {
      flexShrink: 0,
    },
    breakdownRow: {
      gap: t.space.one,
      paddingVertical: t.space.two,
    },
    breakdownTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.two,
    },
    breakdownLabel: {
      flexShrink: 1,
      textTransform: 'capitalize',
    },
    breakdownBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.two,
    },
    track: {
      flex: 1,
      height: 4,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.bgSunken,
      overflow: 'hidden',
    },
    trackFill: {
      height: '100%',
      borderRadius: t.radius.pill,
    },
  });
