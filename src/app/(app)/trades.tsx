/**
 * Trades — a sortable, filterable table.
 *
 * The form lives in `AddTradeSheet` behind an "Add trade" button, and the history
 * is the screen. Sort and filter logic is imported from `@/lib/trade-table`
 * rather than written inline, so it stays pure and testable.
 *
 * Six columns do not fit a phone, so the table scrolls sideways as a unit with
 * fixed column widths — percentages collapse against an unbounded content width,
 * and the header would stop lining up with the rows.
 */

import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AddTradeSheet } from '@/components/add-trade-sheet';
import { ThemedText } from '@/components/themed-text';
import { TradeDetailSheet } from '@/components/trade-detail-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dropdown } from '@/components/ui/dropdown';
import { Pill } from '@/components/ui/pill';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import type { Theme } from '@/constants/theme';
import { useTrades } from '@/hooks/use-trades';
import { formatShortDate, formatSigned } from '@/lib/format';
import { displaySetup, SETUP_TYPES, setupFilterOptions } from '@/lib/setup-types';
import { useThemedStyles } from '@/lib/styles';
import { supabase } from '@/lib/supabase';
import {
  applyFilters,
  applySort,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  nextSortState,
  type SortKey,
  type SortState,
  type TableFilters,
  type TradeRow,
} from '@/lib/trade-table';
import { isImported } from '@/lib/untagged';

const DIRECTION_OPTIONS = [
  { label: 'All directions', value: null },
  { label: 'Buy', value: 'buy' },
  { label: 'Sell', value: 'sell' },
];

const SETUP_CELL_OPTIONS = SETUP_TYPES.map((setup) => ({
  label: setup,
  value: setup as string | null,
}));

export default function TradesScreen() {
  const { trades, loading, refreshing, error, refresh } = useTrades();
  const styles = useThemedStyles(sheet);

  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [filters, setFilters] = useState<TableFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<TradeRow | null>(null);
  const [addVisible, setAddVisible] = useState(false);

  /**
   * Classify a synced trade straight from its row.
   *
   * Imported trades arrive with no setup, and making the user open the detail
   * sheet for each one turns a one-tap job into a five-tap one — the surest way
   * to leave a hundred trades unclassified forever.
   */
  const handleSetupChange = async (trade: TradeRow, setup: string | null) => {
    if (!setup) {
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from('trades')
        .update({ setup_type: setup })
        .eq('id', trade.id);

      if (updateError) {
        throw updateError;
      }

      await refresh();
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Unable to save that setup right now.');
    }
  };

  // Canonical setups plus any legacy free-text value present in the data, so
  // pre-dropdown rows stay reachable through the filter.
  const setupOptions = useMemo(
    () => [
      { label: 'All setups', value: null as string | null },
      ...setupFilterOptions(trades.map((trade) => trade.setup_type)).map((setup) => ({
        label: setup,
        value: setup as string | null,
      })),
    ],
    [trades],
  );

  const rows = useMemo(
    () => applySort(applyFilters(trades, filters), sort),
    [trades, filters, sort],
  );

  const netPl = rows.reduce((sum, row) => sum + row.pl, 0);
  const narrowed = rows.length !== trades.length;

  const toggleSort = (key: SortKey) => setSort((current) => nextSortState(current, key));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ScreenHeader
        title="Trades"
        subtitle="Every trade you have logged, with the mood you were in when you took it."
        action={<Button label="Add" size="sm" onPress={() => setAddVisible(true)} />}
      />

      <View style={styles.filterRow}>
        <Dropdown
          compact
          value={filters.direction === 'all' ? null : filters.direction}
          options={DIRECTION_OPTIONS}
          onChange={(value) =>
            setFilters((current) => ({
              ...current,
              direction: (value as TableFilters['direction']) ?? 'all',
            }))
          }
          placeholder="All directions"
          testID="direction-filter"
        />
        <Dropdown
          compact
          value={filters.setup}
          options={setupOptions}
          onChange={(value) => setFilters((current) => ({ ...current, setup: value }))}
          placeholder="All setups"
          testID="setup-filter"
        />
      </View>

      {loading ? (
        <LoadingState label="Loading your trades…" />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : trades.length === 0 ? (
        <EmptyState
          title="No trades yet"
          body="Log your first trade, or connect MetaTrader 5 to have them sync themselves."
          action={<Button label="Add a trade" onPress={() => setAddVisible(true)} />}
        />
      ) : (
        <Card style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <ThemedText variant="heading">
              {rows.length} {rows.length === 1 ? 'trade' : 'trades'}
            </ThemedText>
            <ThemedText variant="monoLg" tone={netPl >= 0 ? 'gain' : 'loss'}>
              {formatSigned(netPl)}
            </ThemedText>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.headerRow}>
                <HeaderCell
                  label="Date"
                  width={styles.colDate}
                  sortKey="date"
                  sort={sort}
                  onPress={toggleSort}
                />
                <ColumnLabel label="Pair" style={styles.colPair} />
                <ColumnLabel label="Side" style={styles.colDirection} />
                <HeaderCell
                  label="P/L"
                  width={styles.colPl}
                  sortKey="pl"
                  sort={sort}
                  onPress={toggleSort}
                />
                <ColumnLabel label="Setup" style={styles.colSetup} />
                <ColumnLabel label="Mood" style={styles.colMood} />
              </View>

              {rows.length === 0 ? (
                <ThemedText variant="body" tone="textSecondary" style={styles.noMatches}>
                  No trades match these filters.
                </ThemedText>
              ) : (
                rows.map((trade) => (
                  <TableRow
                    key={trade.id}
                    trade={trade}
                    onPress={setSelected}
                    onSetupChange={handleSetupChange}
                  />
                ))
              )}
            </View>
          </ScrollView>

          {narrowed ? (
            <ThemedText variant="caption" tone="textTertiary">
              Showing {rows.length} of {trades.length} trades.
            </ThemedText>
          ) : null}
        </Card>
      )}

      <AddTradeSheet visible={addVisible} onClose={() => setAddVisible(false)} onSaved={refresh} />
      <TradeDetailSheet trade={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}

/** A non-sortable column label. */
function ColumnLabel({ label, style }: { label: string; style: object }) {
  return (
    <View style={style}>
      <ThemedText variant="overline" tone="textTertiary">
        {label.toUpperCase()}
      </ThemedText>
    </View>
  );
}

type HeaderCellProps = {
  label: string;
  width: object;
  sortKey: SortKey;
  sort: SortState;
  onPress: (key: SortKey) => void;
};

/** A sortable column header. The caret only shows on the active column. */
function HeaderCell({ label, width, sortKey, sort, onPress }: HeaderCellProps) {
  const styles = useThemedStyles(sheet);
  const active = sort.key === sortKey;

  return (
    <Pressable
      testID={`sort-${sortKey}`}
      accessibilityRole="button"
      accessibilityLabel={`Sort by ${label}`}
      onPress={() => onPress(sortKey)}
      hitSlop={6}
      style={({ pressed }) => [styles.headerCell, width, pressed && styles.pressed]}
    >
      <ThemedText variant="overline" tone={active ? 'accentText' : 'textTertiary'}>
        {label.toUpperCase()}
      </ThemedText>
      <ThemedText variant="caption" tone={active ? 'accentText' : 'textTertiary'}>
        {active ? (sort.ascending ? '▲' : '▼') : '↕'}
      </ThemedText>
    </Pressable>
  );
}

function TableRow({
  trade,
  onPress,
  onSetupChange,
}: {
  trade: TradeRow;
  onPress: (trade: TradeRow) => void;
  onSetupChange: (trade: TradeRow, setup: string | null) => void;
}) {
  const styles = useThemedStyles(sheet);

  // Only synced rows get an inline picker. A manual row without a setup is one
  // the user deliberately left blank in the form; a synced row never had the
  // chance to have one, so this is the place to give it.
  const needsSetup = isImported(trade) && !trade.setup_type;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(trade)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.colDate}>
        <ThemedText variant="caption" tone="textSecondary">
          {formatShortDate(trade.created_at)}
        </ThemedText>
      </View>

      <View style={styles.colPair}>
        <ThemedText variant="bodyStrong" numberOfLines={1}>
          {trade.pair.toUpperCase()}
          {/* Marks a row that arrived from the broker rather than the form. A
              glyph rather than a seventh column: the table is already wider than
              a phone, and provenance is a footnote, not a field. */}
          {isImported(trade) ? (
            <ThemedText variant="caption" tone="accentText">
              {' '}
              ⟳
            </ThemedText>
          ) : null}
        </ThemedText>
      </View>

      <View style={styles.colDirection}>
        <Pill
          label={trade.direction}
          tone={trade.direction === 'buy' ? 'gain' : 'loss'}
          solid
          caps
        />
      </View>

      <View style={styles.colPl}>
        <ThemedText variant="mono" tone={trade.pl >= 0 ? 'gain' : 'loss'}>
          {formatSigned(trade.pl)}
        </ThemedText>
      </View>

      {needsSetup ? (
        <View style={styles.colSetup}>
          <Dropdown
            compact
            value={null}
            options={SETUP_CELL_OPTIONS}
            onChange={(value) => onSetupChange(trade, value)}
            placeholder="+ Setup"
            testID={`setup-cell-${trade.id}`}
          />
        </View>
      ) : (
        <View style={styles.colSetup}>
          <ThemedText variant="body" tone="textSecondary" numberOfLines={1}>
            {displaySetup(trade.setup_type)}
          </ThemedText>
        </View>
      )}

      <View style={styles.colMood}>
        <ThemedText variant="body" tone="textSecondary" numberOfLines={1}>
          {trade.moods.length > 0 ? trade.moods.join(', ') : '—'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    filterRow: {
      flexDirection: 'row',
      gap: t.space.two,
    },
    tableCard: {
      gap: t.space.two,
    },
    tableHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.two,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.color.borderStrong,
      paddingBottom: t.space.two,
      marginBottom: t.space.one,
    },
    headerCell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.half,
    },
    pressed: {
      opacity: 0.7,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.space.two,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.color.border,
    },
    rowPressed: {
      backgroundColor: t.color.surfaceActive,
    },
    noMatches: {
      paddingVertical: t.space.three,
    },

    // Fixed widths keep the header and rows aligned inside the horizontal
    // scroller — percentages would collapse against the unbounded content width.
    colDate: { width: 72 },
    colPair: { width: 96 },
    colDirection: { width: 64 },
    colPl: { width: 88 },
    colSetup: { width: 132 },
    colMood: { width: 132 },
  });
