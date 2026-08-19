/**
 * Full-screen detail view for a single trade, opened from the trades table and
 * from a calendar day.
 *
 * A modal rather than a `trade/[id]` route on purpose: the tab bars are custom
 * on both platforms (`NativeTabs` natively, `expo-router/ui` on web), so adding
 * a non-tab route needs a Stack restructure with real regression risk. The
 * trade-off is no per-trade deep link.
 *
 * This is where the psychology layer is most visible — mood tags and the motion
 * flag sit alongside the numbers rather than being buried in a list row.
 */

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, SectionHeader } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import type { Theme } from '@/constants/theme';
import { formatFullDate, formatPrice, formatSigned } from '@/lib/format';
import { displaySetup } from '@/lib/setup-types';
import { useThemedStyles } from '@/lib/styles';
import { tradeCosts } from '@/lib/trade-math';
import type { TradeRow } from '@/lib/trade-table';
import { isImported } from '@/lib/untagged';

type TradeDetailSheetProps = {
  trade: TradeRow | null;
  onClose: () => void;
};

/** Plain-English reading of the accelerometer sample taken at mood logging. */
function motionLabel(flag: string | null): string {
  if (flag === 'restless') return 'Restless — you were moving while logging this';
  if (flag === 'steady') return 'Steady — you were still while logging this';
  return 'Not recorded (no accelerometer on web)';
}

/** Broker label for an imported trade's source tag. */
function sourceLabel(source: string): string {
  if (source === 'mt5') return 'MetaTrader 5';
  if (source === 'mt4') return 'MetaTrader 4';
  if (source === 'ctrader') return 'cTrader';
  if (source === 'tradelocker') return 'TradeLocker';
  return source;
}

/**
 * How long the position was actually open, e.g. "2h 14m".
 *
 * Only imported trades carry real open and close times, so this is the one
 * fact the detail sheet can show that a manually typed row cannot -- and it is
 * the psychological one: a scalp held for six hours was not a scalp.
 */
function holdTime(openedAt: string, closedAt: string): string | null {
  const ms = Date.parse(closedAt) - Date.parse(openedAt);

  if (!Number.isFinite(ms) || ms < 0) {
    return null;
  }

  const minutes = Math.round(ms / 60000);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours < 24) {
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;

  return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}

export function TradeDetailSheet({ trade, onClose }: TradeDetailSheetProps) {
  const styles = useThemedStyles(sheet);

  const held =
    trade?.opened_at && trade?.closed_at ? holdTime(trade.opened_at, trade.closed_at) : null;

  const costs = trade ? tradeCosts(trade) : null;

  return (
    <Sheet
      visible={trade !== null}
      onClose={onClose}
      title={trade ? trade.pair.toUpperCase() : ''}
      subtitle={trade ? formatFullDate(trade.created_at) : undefined}
    >
      {trade ? (
        <>
          {/* The number the user opened this sheet for, on the hero colour so it
              reads as the headline rather than the first of five cards. */}
          <View style={styles.plCard}>
            <ThemedText variant="overline" tone="heroMuted">
              PROFIT / LOSS
            </ThemedText>
            <ThemedText variant="monoXl" tone={trade.pl >= 0 ? 'gain' : 'loss'}>
              {formatSigned(trade.pl)}
            </ThemedText>
            <View style={styles.plMeta}>
              <Pill
                label={trade.direction}
                tone={trade.direction === 'buy' ? 'gain' : 'loss'}
                solid
                caps
              />
              {isImported(trade) ? <Pill label={sourceLabel(trade.source)} tone="accent" /> : null}
            </View>
          </View>

          <View>
            <SectionHeader title="Execution" />
            <Card style={styles.rows}>
              <DetailRow label="Entry price" value={formatPrice(Number(trade.entry_price))} />
              <DetailRow label="Exit price" value={formatPrice(Number(trade.exit_price))} />
              <DetailRow label="Size" value={formatPrice(Number(trade.size))} />
              <DetailRow label="Setup" value={displaySetup(trade.setup_type)} />
            </Card>
          </View>

          {/* Costs sit directly under Execution, because they are the gap
              between the prices above and the headline P/L at the top. Only
              rendered when the broker actually reported them — see tradeCosts. */}
          {costs?.hasCosts ? (
            <View>
              <SectionHeader
                title="Costs"
                subtitle="What the market gave, and what the broker took."
              />
              <Card style={styles.rows}>
                <DetailRow label="Gross P/L" value={formatSigned(costs.gross)} />
                {trade.commission !== null ? (
                  <DetailRow label="Commission" value={formatSigned(costs.commission)} />
                ) : null}
                {trade.swap !== null ? (
                  <DetailRow label="Swap" value={formatSigned(costs.swap)} />
                ) : null}
                <DetailRow label="Net P/L" value={formatSigned(costs.net)} />

                {/* The one reading worth spelling out. A trade that was green on
                    the chart and red in the account is the single most useful
                    thing this breakdown can tell someone, and it is invisible
                    when only the net figure is shown. */}
                {costs.gross > 0 && costs.net < 0 ? (
                  <ThemedText variant="caption" tone="loss">
                    This trade was profitable on the chart and became a loss after costs.
                  </ThemedText>
                ) : costs.total !== 0 ? (
                  <ThemedText variant="caption" tone="textTertiary">
                    {costs.total < 0
                      ? `Costs took ${formatPrice(Math.abs(costs.total))} off this trade.`
                      : `Carry added ${formatPrice(costs.total)} to this trade.`}
                  </ThemedText>
                ) : null}
              </Card>
            </View>
          ) : null}

          {/* Imported trades carry facts a typed row cannot: which account they
              came from and how long the position was actually held. */}
          {isImported(trade) ? (
            <View>
              <SectionHeader title="Sync" subtitle="Straight from your broker." />
              <Card style={styles.rows}>
                <DetailRow label="Source" value={sourceLabel(trade.source)} />
                {trade.opened_at ? (
                  <DetailRow label="Opened" value={formatFullDate(trade.opened_at)} />
                ) : null}
                {trade.closed_at ? (
                  <DetailRow label="Closed" value={formatFullDate(trade.closed_at)} />
                ) : null}
                {held ? <DetailRow label="Held for" value={held} /> : null}
              </Card>
            </View>
          ) : null}

          <View>
            <SectionHeader title="Psychology" subtitle="Why this app exists." />
            <Card style={styles.rows}>
              <ThemedText variant="label" tone="textSecondary">
                Mood
              </ThemedText>
              {trade.moods.length > 0 ? (
                <View style={styles.moodRow}>
                  {trade.moods.map((mood, index) => (
                    <Pill key={`${mood}-${index}`} label={mood} tone="accent" />
                  ))}
                </View>
              ) : (
                <ThemedText variant="body" tone="textTertiary">
                  No mood logged for this trade.
                </ThemedText>
              )}

              <View style={styles.motionBlock}>
                <ThemedText variant="label" tone="textSecondary">
                  Motion at logging
                </ThemedText>
                <ThemedText variant="body" tone="textTertiary">
                  {motionLabel(trade.motion_flag)}
                </ThemedText>
              </View>
            </Card>
          </View>

          <View>
            <SectionHeader title="Notes" />
            <Card>
              <ThemedText variant="body" tone={trade.notes?.trim() ? 'text' : 'textTertiary'}>
                {trade.notes?.trim() || 'No notes on this trade.'}
              </ThemedText>
            </Card>
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(sheet);

  return (
    <View style={styles.detailRow}>
      <ThemedText variant="body" tone="textSecondary">
        {label}
      </ThemedText>
      {/* Mono so a column of prices lines up on the decimal point. */}
      <ThemedText variant="mono" style={styles.detailValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    plCard: {
      backgroundColor: t.color.hero,
      borderRadius: t.radius.xl,
      padding: t.space.four,
      gap: t.space.one,
      alignItems: 'flex-start',
    },
    plMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: t.space.one,
      marginTop: t.space.one,
    },
    rows: {
      gap: t.space.two,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.three,
    },
    detailValue: {
      flexShrink: 1,
      textAlign: 'right',
    },
    moodRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: t.space.one,
    },
    motionBlock: {
      gap: t.space.half,
      marginTop: t.space.two,
    },
  });
