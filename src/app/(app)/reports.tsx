import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import ReportsScreen from '../../design/reports-screen';
import { colors } from '../../design/theme';
import { useTrades } from '@/hooks/use-trades';
import { withinRange, type RangeKey } from '@/lib/date-range';
import { displaySetup } from '@/lib/setup-types';
import { breakdownBy, buildDailySeries, computeStats } from '@/lib/trade-stats';

const METHOD_LABEL: Record<string, string> = {
  hand: 'By hand',
  screenshot: 'Screenshot',
  history: 'History import',
  chat: 'Chat / voice',
  plan: 'Plan (voice or text)',
  report: 'Report import',
  mt5: 'Auto-sync',
};

const RANGES: Record<string, RangeKey> = {
  '7 days': '7d',
  '30 days': '30d',
  '90 days': '90d',
  All: 'all',
};

export default function Reports() {
  const router = useRouter();
  const { trades } = useTrades();
  const [range, setRange] = useState<RangeKey>('all');

  const data = useMemo(() => {
    const scoped = withinRange(trades, range, new Date());
    const stats = computeStats(scoped);
    let running = 0;
    const growth = buildDailySeries(scoped).map((d) => (running += d.pl));
    const bySetup = breakdownBy(scoped, (t) =>
      t.setup_type?.trim() ? [displaySetup(t.setup_type)] : [],
    ).map((r) => ({ label: r.label, value: r.netPl }));
    const byMood = breakdownBy(scoped, (t) => [
      ...new Set(t.moods.map((m) => m.toLowerCase())),
    ]).map((r) => ({ label: r.label, value: r.netPl }));

    const byMethod = breakdownBy(scoped, (t) => {
      const key = t.log_method ?? (t.source && t.source !== 'manual' ? t.source : null);
      return [key ? (METHOD_LABEL[key] ?? key) : 'Before tracking'];
    }).map((r) => ({ label: r.label + ' (' + r.trades + ')', value: r.netPl }));

    let insight: string | undefined;
    if (stats.trades > 0) {
      const best = bySetup[0];
      const worst = byMood[byMood.length - 1];
      insight = `${stats.trades} trades, ${stats.winRate.toFixed(0)}% won.`;
      if (best) insight += ` Your best setup is ${best.label}.`;
      if (worst && worst.value < 0) insight += ` Trades tagged "${worst.label}" cost you the most.`;
    }

    const totalTrades = scoped.length;
    const withMood = scoped.filter((t) => t.moods && t.moods.length > 0).length;
    const moodCoveragePct = totalTrades > 0 ? Math.round((withMood / totalTrades) * 100) : 0;

    const fullCoverage = scoped.filter((t) => (t.shot_count ?? (t.shots?.length ?? 0)) >= 2).length;
    const partialCoverage = scoped.filter((t) => (t.shot_count ?? (t.shots?.length ?? 0)) === 1).length;
    const missingCoverage = scoped.filter((t) => (t.shot_count ?? (t.shots?.length ?? 0)) === 0).length;
    const shotCoveragePct = totalTrades > 0 ? Math.round((fullCoverage / totalTrades) * 100) : 0;
    const totalShots = scoped.reduce((sum, t) => sum + (t.shot_count ?? (t.shots?.length ?? 0)), 0);

    const coverage = {
      totalTrades,
      withMood,
      moodCoveragePct,
      fullCoverage,
      partialCoverage,
      missingCoverage,
      shotCoveragePct,
      totalShots,
    };

    return {
      net: stats.trades ? stats.netPl : undefined,
      winRate: stats.trades ? stats.winRate : undefined,
      profitFactor: stats.profitFactor ?? undefined,
      growth,
      bySetup,
      byMood,
      byMethod,
      coverage,
      insight,
    };
  }, [trades, range]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ReportsScreen
        {...data}
        onTalk={() => router.push('/chat' as never)}
        onRangeChange={(r) => setRange(RANGES[r] ?? 'all')}
      />
    </View>
  );
}
