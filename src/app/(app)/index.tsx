import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ConnectBrokerSheet } from '@/components/connect-broker-sheet';
import { HistoryImportSheet } from '@/components/history-import-sheet';
import { ImportReportSheet } from '@/components/import-report-sheet';
import { JournalSheet } from '@/components/journal-sheet';
import { TradeDetailSheet } from '@/components/trade-detail-sheet';
import { useTrades } from '@/hooks/use-trades';
import { withinRange } from '@/lib/date-range';
import { formatRelative, formatShortDate } from '@/lib/format';
import type { JournalEntry } from '@/lib/journal';
import { displayName, useSession } from '@/lib/session';
import { computeStats } from '@/lib/trade-stats';
import HomeScreen, { type HomeStats, type OpenPlan, type RecentTrade } from '../../design/home-screen';
import { colors } from '../../design/theme';

type OpenModal = null | 'journal' | 'auto' | 'import' | 'screenshots';

const RECENT_COUNT = 5;

export default function Index() {
  const router = useRouter();
  const { trades, openEntries, refresh, live } = useTrades();
  const { user } = useSession();
  const [open, setOpen] = useState<OpenModal>(null);
  /** The journal entry being resumed, or null for a fresh plan. */
  const [resuming, setResuming] = useState<JournalEntry | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);

  const close = () => {
    setOpen(null);
    setResuming(null);
  };

  const userName = user ? displayName(user) : 'Trader';

  const openPlans = useMemo<OpenPlan[]>(
    () =>
      openEntries.map((entry) => ({
        id: entry.id,
        pair: entry.pair,
        direction: entry.direction,
        status: entry.status === 'open' ? 'open' : 'planned',
        grade: entry.grade,
        checkins: entry.checkins.length,
        started: formatRelative(entry.created_at),
      })),
    [openEntries],
  );

  const recent = useMemo<RecentTrade[]>(
    () =>
      trades.slice(0, RECENT_COUNT).map((t) => ({
        id: t.id,
        pair: t.pair,
        direction: t.direction,
        result: Math.round(t.pl * 100) / 100,
        date: formatShortDate(t.created_at),
        journaled: !!t.journal_entry,
      })),
    [trades],
  );

  const stats = useMemo<HomeStats | null>(() => {
    const scoped = withinRange(trades, '30d', new Date());
    if (scoped.length === 0) {
      return null;
    }
    const s = computeStats(scoped);
    return { net: s.netPl, winRate: s.winRate, count: s.trades };
  }, [trades]);

  const selectedTrade = trades.find((t) => t.id === selectedTradeId) ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <HomeScreen
        tradeCount={trades.length}
        userName={userName}
        openPlans={openPlans}
        recent={recent}
        stats={stats}
        onManual={() => {
          setResuming(null);
          setOpen('journal');
        }}
        onAuto={() => setOpen('auto')}
        onScreenshots={() => setOpen('screenshots')}
        onOpenPlan={(id) => {
          const entry = openEntries.find((e) => e.id === id) ?? null;
          setResuming(entry);
          setOpen('journal');
        }}
        onOpenTrade={(id) => setSelectedTradeId(id)}
        onSeeAllTrades={() => router.push('/trades')}
      />

      {/* One journal sheet: a fresh plan, or an open one picked up where it was left. */}
      <JournalSheet
        visible={open === 'journal'}
        initialEntry={resuming}
        initialPhase={resuming?.status === 'open' ? 'during' : 'before'}
        onClose={close}
        onSaved={refresh}
      />

      {/* Auto: MetaTrader connect & report import */}
      <ConnectBrokerSheet
        visible={open === 'auto'}
        onClose={close}
        trades={trades}
        live={live}
        onImportInstead={() => setOpen('import')}
      />
      <ImportReportSheet
        visible={open === 'import'}
        onClose={close}
        trades={trades}
        onImported={refresh}
      />

      {/* AI reads closed trades off history screenshots; nothing saves unticked. */}
      <HistoryImportSheet visible={open === 'screenshots'} onClose={close} onSaved={refresh} />

      <TradeDetailSheet
        trade={selectedTrade}
        onClose={() => setSelectedTradeId(null)}
        onUpdated={refresh}
      />
    </View>
  );
}
