/**
 * Calendar — a monthly heatmap of trading days.
 *
 * Each day is a box shaded by that day's net P/L (green for profit, red for
 * loss, muted for no trades); tapping a day lists the trades taken on it, and
 * tapping one of those opens the full detail sheet.
 *
 * The fill intensity comes from `dayFill` in `@/lib/calendar`, which takes the
 * active scheme's tokens as an argument — so the heatmap is the brand green in
 * both schemes rather than a hardcoded light-mode palette.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TradeDetailSheet } from '@/components/trade-detail-sheet';
import { Button } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { Stat, toneFor } from '@/components/ui/stat';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import type { Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTrades } from '@/hooks/use-trades';
import { buildMonth, dayFill, dayKey, isOnDay, monthLabel, type DayBucket } from '@/lib/calendar';
import { formatSigned } from '@/lib/format';
import { displaySetup } from '@/lib/setup-types';
import { useThemedStyles } from '@/lib/styles';
import type { TradeRow } from '@/lib/trade-table';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Above this |P/L| a cell's fill is dark/saturated enough to need inverted text. */
const HEAVY_FILL_PL = 100;

export default function CalendarScreen() {
  const { trades, loading, refreshing, error, refresh } = useTrades();
  const styles = useThemedStyles(sheet);

  // Offset in months from the current month; 0 = this month, -1 = last month.
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<TradeRow | null>(null);

  const anchor = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  const month = useMemo(() => buildMonth(anchor, trades), [anchor, trades]);

  const monthPl = month.days.reduce((sum, day) => sum + day.pl, 0);
  const monthTrades = month.days.reduce((sum, day) => sum + day.trades, 0);
  const monthWins = month.days.reduce((sum, day) => sum + day.wins, 0);
  const greenDays = month.days.filter((day) => day.trades > 0 && day.pl > 0).length;
  const redDays = month.days.filter((day) => day.trades > 0 && day.pl < 0).length;

  const activeDay = selectedDay ? month.days.find((day) => day.key === selectedDay) ?? null : null;

  const dayTrades = useMemo(
    () => (activeDay ? trades.filter((trade) => isOnDay(trade, activeDay.date)) : []),
    [activeDay, trades],
  );

  const todayKey = dayKey(new Date());

  const changeMonth = (delta: number) => {
    setMonthOffset((current) => current + delta);
    setSelectedDay(null);
  };

  const goToday = () => {
    setMonthOffset(0);
    setSelectedDay(null);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ScreenHeader
        title="Calendar"
        subtitle="Every trading day at a glance. Deeper colour means a bigger day, either way."
      />

      <Card style={styles.gridCard}>
        <View style={styles.monthNav}>
          <NavButton label="‹" hint="Previous month" testID="prev-month" onPress={() => changeMonth(-1)} />

          <View style={styles.monthTitle}>
            <ThemedText variant="heading">{monthLabel(anchor)}</ThemedText>
            {/* Six taps back is six taps to return, so offer the shortcut — but
                only when there is somewhere to return from. */}
            {monthOffset !== 0 ? (
              <Button label="Today" variant="ghost" size="sm" onPress={goToday} testID="today" />
            ) : null}
          </View>

          <NavButton label="›" hint="Next month" testID="next-month" onPress={() => changeMonth(1)} />
        </View>

        {loading ? (
          <LoadingState label="Loading your trades…" />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : (
          <>
            <View style={styles.weekdayRow}>
              {WEEKDAYS.map((weekday) => (
                <View key={weekday} style={styles.cellSlot}>
                  <ThemedText variant="overline" tone="textTertiary" style={styles.weekday}>
                    {weekday.toUpperCase()}
                  </ThemedText>
                </View>
              ))}
            </View>

            <View style={styles.grid} testID="calendar-grid">
              {/* Blank cells push day 1 onto its real weekday column. */}
              {Array.from({ length: month.leadingBlanks }, (_, index) => (
                <View key={`blank-${index}`} style={styles.cellSlot} />
              ))}

              {month.days.map((day) => (
                <DayCell
                  key={day.key}
                  day={day}
                  isToday={day.key === todayKey}
                  isSelected={day.key === selectedDay}
                  onPress={() =>
                    setSelectedDay((current) => (current === day.key ? null : day.key))
                  }
                />
              ))}
            </View>

            <View style={styles.legendRow}>
              <Legend count={`${greenDays} green`} tone="gain" />
              <Legend count={`${redDays} red`} tone="loss" />
              <Legend count="no trades" tone="neutral" />
            </View>
          </>
        )}
      </Card>

      {!loading && !error ? (
        <View>
          <SectionHeader title="This month" subtitle={monthLabel(anchor)} />
          {monthTrades === 0 ? (
            <EmptyState
              title="Nothing logged"
              body={`No trades in ${monthLabel(anchor)}. Pick another month, or add a trade from the Trades tab.`}
            />
          ) : (
            <View style={styles.statRow}>
              <Stat
                label="Net P/L"
                value={formatSigned(monthPl)}
                caption={`${monthTrades} ${monthTrades === 1 ? 'trade' : 'trades'}`}
                tone={toneFor(monthPl)}
              />
              <Stat
                label="Win rate"
                value={`${Math.round((monthWins / monthTrades) * 100)}%`}
                caption={`${monthWins} of ${monthTrades} won`}
              />
            </View>
          )}
        </View>
      ) : null}

      {activeDay ? (
        <View>
          <SectionHeader
            title={activeDay.date.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
            subtitle={`${activeDay.trades} ${activeDay.trades === 1 ? 'trade' : 'trades'} • ${formatSigned(activeDay.pl)}`}
            action={
              <Button
                label="Clear"
                variant="ghost"
                size="sm"
                onPress={() => setSelectedDay(null)}
                testID="clear-day"
              />
            }
          />
          {dayTrades.length === 0 ? (
            <Card>
              <ThemedText variant="body" tone="textSecondary">
                No trades on this day.
              </ThemedText>
            </Card>
          ) : (
            <Card flush>
              {dayTrades.map((trade, index) => (
                <View key={trade.id}>
                  {index > 0 ? <View style={styles.rowDivider} /> : null}
                  <DayTrade trade={trade} onPress={setSelectedTrade} />
                </View>
              ))}
            </Card>
          )}
        </View>
      ) : null}

      <TradeDetailSheet trade={selectedTrade} onClose={() => setSelectedTrade(null)} />
    </Screen>
  );
}

/** Circular chevron for the month stepper. */
function NavButton({
  label,
  hint,
  testID,
  onPress,
}: {
  label: string;
  hint: string;
  testID: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(sheet);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={hint}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
    >
      <ThemedText variant="heading" tone="text">
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Legend({ count, tone }: { count: string; tone: 'gain' | 'loss' | 'neutral' }) {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);

  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: theme.color[tone] }]} />
      <ThemedText variant="caption" tone="textTertiary">
        {count}
      </ThemedText>
    </View>
  );
}

function DayCell({
  day,
  isToday,
  isSelected,
  onPress,
}: {
  day: DayBucket;
  isToday: boolean;
  isSelected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);

  const fill = dayFill(day, theme.color);
  /**
   * A near-opaque fill needs the on-fill text token rather than the page's.
   * That token flips per scheme — white on light mode's deep green, near-black
   * on dark mode's bright green — which is exactly what this needs, because the
   * fill colour flips with it.
   */
  const heavy = day.trades > 0 && Math.abs(day.pl) > HEAVY_FILL_PL;

  return (
    <View style={styles.cellSlot}>
      <Pressable
        testID={`day-${day.key}`}
        accessibilityRole="button"
        accessibilityLabel={
          day.trades > 0
            ? `${day.date.getDate()}, ${day.trades} trades, ${formatSigned(day.pl)}`
            : `${day.date.getDate()}, no trades`
        }
        onPress={onPress}
        style={({ pressed }) => [
          styles.dayCell,
          { backgroundColor: fill },
          isToday && styles.todayCell,
          isSelected && styles.selectedCell,
          pressed && styles.pressed,
        ]}
      >
        <ThemedText variant="caption" tone={heavy ? 'textOnFill' : 'text'}>
          {day.date.getDate()}
        </ThemedText>
        {day.trades > 0 ? (
          <ThemedText variant="overline" tone={heavy ? 'textOnFill' : 'textTertiary'}>
            {day.trades}
          </ThemedText>
        ) : null}
      </Pressable>
    </View>
  );
}

function DayTrade({
  trade,
  onPress,
}: {
  trade: TradeRow;
  onPress: (trade: TradeRow) => void;
}) {
  const styles = useThemedStyles(sheet);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(trade)}
      style={({ pressed }) => [styles.dayTrade, pressed && styles.rowPressed]}
    >
      <View style={styles.dayTradeTop}>
        <ThemedText variant="bodyStrong">{trade.pair.toUpperCase()}</ThemedText>
        <ThemedText variant="monoLg" tone={trade.pl >= 0 ? 'gain' : 'loss'}>
          {formatSigned(trade.pl)}
        </ThemedText>
      </View>
      <View style={styles.dayTradeMeta}>
        <Pill label={trade.direction} tone={trade.direction === 'buy' ? 'gain' : 'loss'} solid caps />
        <ThemedText variant="caption" tone="textTertiary">
          {displaySetup(trade.setup_type)}
        </ThemedText>
        {trade.moods.map((mood, index) => (
          <Pill key={`${trade.id}-${mood}-${index}`} label={mood} />
        ))}
      </View>
    </Pressable>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    gridCard: {
      gap: t.space.two,
    },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.two,
    },
    monthTitle: {
      flex: 1,
      alignItems: 'center',
      gap: t.space.half,
    },
    navButton: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.borderStrong,
      borderRadius: t.radius.pill,
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navButtonPressed: {
      backgroundColor: t.color.surfaceActive,
    },
    weekdayRow: {
      flexDirection: 'row',
    },
    weekday: {
      textAlign: 'center',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    /**
     * Seven equal columns. The slot owns the width and the gutter; the cell
     * inside it fills the slot. Splitting them is what lets the cells have gaps
     * between them without the 1/7 arithmetic drifting — a margin on a
     * percentage-width cell overflows the row and wraps six days onto a line.
     */
    cellSlot: {
      width: `${100 / 7}%`,
      padding: 2,
    },
    dayCell: {
      aspectRatio: 1,
      borderRadius: t.radius.sm,
      borderWidth: 1,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.space.half,
    },
    todayCell: {
      borderColor: t.color.textTertiary,
    },
    selectedCell: {
      borderColor: t.color.accent,
      borderWidth: 2,
    },
    pressed: {
      opacity: 0.7,
    },
    legendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: t.space.three,
      paddingTop: t.space.one,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.one,
    },
    legendSwatch: {
      width: 12,
      height: 12,
      borderRadius: t.radius.xs,
    },
    statRow: {
      flexDirection: 'row',
      gap: t.space.three,
    },
    dayTrade: {
      paddingHorizontal: t.space.three,
      paddingVertical: t.space.three,
      gap: t.space.two,
    },
    rowPressed: {
      backgroundColor: t.color.surfaceActive,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.color.border,
    },
    dayTradeTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.two,
    },
    dayTradeMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: t.space.one,
    },
  });
