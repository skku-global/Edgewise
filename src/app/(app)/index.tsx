/**
 * Dashboard — the landing screen.
 *
 * The headline stats, the equity curve, and the mood-pattern insight that is the
 * reason this app exists rather than a spreadsheet. The account button lives in
 * the header here because this is the screen everyone lands on, and it is the
 * app's only sign-out path.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { EquityCurve } from '@/components/charts/equity-curve';
import { ConnectBrokerSheet } from '@/components/connect-broker-sheet';
import { ImportReportSheet } from '@/components/import-report-sheet';
import { TagTradeSheet } from '@/components/tag-trade-sheet';
import { ThemedText } from '@/components/themed-text';
import { TradeDetailSheet } from '@/components/trade-detail-sheet';
import { AccountButton } from '@/components/ui/account-button';
import { Button } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { Stat, toneFor } from '@/components/ui/stat';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import type { Theme } from '@/constants/theme';
import { buildEquitySeries, useTrades } from '@/hooks/use-trades';
import { relativeTime, syncStatus } from '@/lib/broker-sync';
import { formatShortDate, formatSigned } from '@/lib/format';
import { displayName, useSession } from '@/lib/session';
import { useThemedStyles } from '@/lib/styles';
import { analyzeMoodPatterns } from '@/lib/trade-insights';
import type { TradeRow } from '@/lib/trade-table';
import { tagPromptLabel, untaggedTrades } from '@/lib/untagged';

const RECENT_TRADE_LIMIT = 5;

export default function DashboardScreen() {
  const { trades, loading, refreshing, error, refresh, live } = useTrades();
  const { user } = useSession();
  const styles = useThemedStyles(sheet);

  const [selected, setSelected] = useState<TradeRow | null>(null);
  const [tagVisible, setTagVisible] = useState(false);
  const [connectVisible, setConnectVisible] = useState(false);
  const [importVisible, setImportVisible] = useState(false);

  const series = useMemo(() => buildEquitySeries(trades), [trades]);
  const sync = useMemo(() => syncStatus(trades), [trades]);

  // Trades that arrived from a broker with no mood attached. Recomputed from the
  // loaded rows, so tagging one and refreshing shortens the queue.
  const untagged = useMemo(() => untaggedTrades(trades), [trades]);
  const tagPrompt = tagPromptLabel(trades);

  const wins = trades.filter((trade) => trade.pl > 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const equity = trades.reduce((sum, trade) => sum + trade.pl, 0);
  const recent = trades.slice(0, RECENT_TRADE_LIMIT);
  const derivedCount = trades.filter((trade) => trade.derived).length;
  const insight = analyzeMoodPatterns(trades);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ScreenHeader
        title={`Hi ${displayName(user)}`}
        subtitle={
          trades.length === 0
            ? 'Log your first trade to start building your edge.'
            : `Your performance across ${trades.length} ${trades.length === 1 ? 'trade' : 'trades'}.`
        }
        action={<AccountButton />}
      />

      {loading ? (
        <LoadingState label="Loading your trades…" />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : trades.length === 0 ? (
        <EmptyState
          title="No trades yet"
          body="Connect MetaTrader and your closed trades import themselves — or add one by hand to see your win rate, equity curve and mood patterns."
          action={<Button label="Connect MetaTrader" onPress={() => setConnectVisible(true)} />}
        />
      ) : (
        <>
          {/* The front door to the psychology layer. Once trades sync themselves
              this card is the only thing still asking the user for anything, so
              it sits above the numbers. */}
          {tagPrompt ? (
            <Pressable
              testID="tag-prompt"
              accessibilityRole="button"
              onPress={() => setTagVisible(true)}
              style={({ pressed }) => [styles.prompt, pressed && styles.pressed]}
            >
              <View style={styles.promptText}>
                <ThemedText variant="subheading" tone="accentText">
                  {tagPrompt}
                </ThemedText>
                <ThemedText variant="body" tone="textSecondary">
                  They came in from your broker with the numbers already filled. Tap to add how you
                  were feeling.
                </ThemedText>
              </View>
              <ThemedText variant="title" tone="accentText">
                ›
              </ThemedText>
            </Pressable>
          ) : null}

          {/* Shown only until the first broker trade lands, and never alongside
              the tag prompt — the two are mutually exclusive, since there is
              nothing to tag until something has been imported. */}
          {!sync.connected ? (
            <Pressable
              testID="connect-prompt"
              accessibilityRole="button"
              onPress={() => setConnectVisible(true)}
              style={({ pressed }) => [styles.prompt, pressed && styles.pressed]}
            >
              <View style={styles.promptText}>
                <ThemedText variant="subheading" tone="accentText">
                  Stop typing your trades in
                </ThemedText>
                <ThemedText variant="body" tone="textSecondary">
                  Connect MetaTrader once and every closed trade arrives on its own, with the
                  numbers already filled in.
                </ThemedText>
              </View>
              <ThemedText variant="title" tone="accentText">
                ›
              </ThemedText>
            </Pressable>
          ) : null}

          <View style={styles.statRow}>
            <Stat
              label="Win rate"
              value={`${winRate.toFixed(0)}%`}
              caption={`${wins} of ${trades.length} profitable`}
            />
            <Stat
              label="Net P/L"
              value={formatSigned(equity)}
              caption="Sum of profit and loss"
              tone={toneFor(equity)}
            />
          </View>

          <View>
            <SectionHeader
              title="Equity curve"
              subtitle="Cumulative profit and loss, oldest trade to newest."
            />
            <Card>
              <EquityCurve points={series} testID="equity-curve" />
            </Card>
          </View>

          {derivedCount > 0 ? (
            <ThemedText variant="caption" tone="textTertiary">
              {derivedCount === trades.length
                ? 'P/L calculated from entry, exit and size — no stored values yet.'
                : `${derivedCount} of ${trades.length} trades have no stored P/L, so those are calculated from entry, exit and size.`}
            </ThemedText>
          ) : null}

          <View>
            <SectionHeader title="Mood pattern" />
            <Card style={styles.insightCard}>
              <ThemedText
                variant={insight.conclusive ? 'bodyStrong' : 'body'}
                tone={insight.conclusive ? 'text' : 'textSecondary'}
              >
                {insight.summary}
              </ThemedText>
              {insight.conclusive ? (
                <ThemedText variant="caption" tone="textTertiary">
                  Calm/confident: {insight.composed.wins}/{insight.composed.trades} won •
                  Anxious/frustrated: {insight.stressed.wins}/{insight.stressed.trades} won
                </ThemedText>
              ) : null}
            </Card>
          </View>

          <View>
            <SectionHeader
              title="Recent trades"
              subtitle={`Latest ${Math.min(recent.length, RECENT_TRADE_LIMIT)} of ${trades.length}`}
            />
            <Card flush>
              {recent.map((trade, index) => (
                <View key={trade.id}>
                  {index > 0 ? <View style={styles.rowDivider} /> : null}
                  <RecentTrade trade={trade} onPress={setSelected} />
                </View>
              ))}
            </Card>
          </View>

          {/* Once the sync is working it should be quiet. A footer line is enough
              to confirm it is alive and to get back to the setup screen, without
              spending a card on a thing that needs no attention. */}
          {sync.connected ? (
            <Pressable
              testID="sync-status"
              accessibilityRole="button"
              accessibilityLabel="Broker sync status"
              onPress={() => setConnectVisible(true)}
              style={({ pressed }) => [styles.syncRow, pressed && styles.pressed]}
            >
              <ThemedText variant="caption" tone="textTertiary" style={styles.syncText}>
                Importing from MetaTrader
                {sync.accounts.length > 0 ? ` · account ${sync.accounts[0]}` : ''}
                {sync.lastTradeAt ? ` · last trade ${relativeTime(sync.lastTradeAt, new Date())}` : ''}
              </ThemedText>
              <Pill label={live ? 'Live' : 'Polling'} tone={live ? 'gain' : 'neutral'} />
            </Pressable>
          ) : null}
        </>
      )}

      <TradeDetailSheet trade={selected} onClose={() => setSelected(null)} />
      <TagTradeSheet
        visible={tagVisible}
        trades={untagged}
        onClose={() => setTagVisible(false)}
        onSaved={refresh}
      />
      <ConnectBrokerSheet
        visible={connectVisible}
        onClose={() => setConnectVisible(false)}
        trades={trades}
        live={live}
        // One closes before the other opens. Two modals on screen at once is
        // a native problem rather than a layout one.
        onImportInstead={() => {
          setConnectVisible(false);
          setImportVisible(true);
        }}
      />
      <ImportReportSheet
        visible={importVisible}
        onClose={() => setImportVisible(false)}
        trades={trades}
        onImported={refresh}
      />
    </Screen>
  );
}

function RecentTrade({
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
      accessibilityLabel={`${trade.pair} ${trade.direction}, ${formatSigned(trade.pl)}`}
      onPress={() => onPress(trade)}
      style={({ pressed }) => [styles.tradeRow, pressed && styles.rowPressed]}
    >
      <View style={styles.tradeMain}>
        <View style={styles.tradeTop}>
          <ThemedText variant="bodyStrong">{trade.pair.toUpperCase()}</ThemedText>
          <ThemedText variant="monoLg" tone={trade.pl >= 0 ? 'gain' : 'loss'}>
            {formatSigned(trade.pl)}
          </ThemedText>
        </View>

        <View style={styles.tradeMeta}>
          <Pill
            label={trade.direction}
            tone={trade.direction === 'buy' ? 'gain' : 'loss'}
            solid
            caps
          />
          <ThemedText variant="caption" tone="textTertiary">
            {formatShortDate(trade.created_at)}
          </ThemedText>
          {trade.moods.length > 0 ? (
            trade.moods.map((mood, index) => (
              <Pill key={`${trade.id}-${mood}-${index}`} label={mood} />
            ))
          ) : (
            <ThemedText variant="caption" tone="textTertiary">
              No mood
            </ThemedText>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    // Tinted rather than another card: it is a call to action, not a stat.
    prompt: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.three,
      backgroundColor: t.color.accentSoft,
      borderColor: t.color.accent,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: t.radius.lg,
      padding: t.space.three,
    },
    promptText: {
      flex: 1,
      gap: t.space.half,
    },
    pressed: {
      opacity: 0.7,
    },
    statRow: {
      flexDirection: 'row',
      gap: t.space.three,
    },
    insightCard: {
      gap: t.space.two,
    },
    syncRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.two,
      paddingVertical: t.space.one,
    },
    syncText: {
      flexShrink: 1,
    },
    tradeRow: {
      paddingHorizontal: t.space.three,
      paddingVertical: t.space.three,
    },
    rowPressed: {
      backgroundColor: t.color.surfaceActive,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.color.border,
    },
    tradeMain: {
      gap: t.space.two,
    },
    tradeTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.two,
    },
    tradeMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: t.space.one,
    },
  });
