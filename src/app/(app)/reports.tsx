import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import ReportsScreen from '../../design/reports-screen';
import { colors } from '../../design/theme';
import { useTrades } from '@/hooks/use-trades';
import { withinRange, type RangeKey } from '@/lib/date-range';
import { displaySetup } from '@/lib/setup-types';
import { breakdownBy, buildDailySeries, computeStats } from '@/lib/trade-stats';

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

    let insight: string | undefined;
    if (stats.trades > 0) {
      const best = bySetup[0];
      const worst = byMood[byMood.length - 1];
      insight = `${stats.trades} trades, ${stats.winRate.toFixed(0)}% won.`;
      if (best) insight += ` Your best setup is ${best.label}.`;
      if (worst && worst.value < 0) insight += ` Trades tagged "${worst.label}" cost you the most.`;
    }

    return {
      net: stats.trades ? stats.netPl : undefined,
      winRate: stats.trades ? stats.winRate : undefined,
      profitFactor: stats.profitFactor ?? undefined,
      growth,
      bySetup,
      byMood,
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
