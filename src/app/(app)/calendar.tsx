import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { AddTradeSheet } from '@/components/add-trade-sheet';
import { TradeDetailSheet } from '@/components/trade-detail-sheet';
import { useTrades } from '@/hooks/use-trades';
import { dayKey } from '@/lib/calendar';
import type { TradeRow } from '@/lib/trade-table';
import CalendarScreen from '../../design/calendar-screen';
import { colors } from '../../design/theme';

export default function Calendar() {
  const { trades, refresh } = useTrades();
  const [selectedTrade, setSelectedTrade] = useState<TradeRow | null>(null);
  const [addVisible, setAddVisible] = useState(false);

  const results = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of trades) {
      const k = dayKey(new Date(t.created_at));
      map[k] = Math.round(((map[k] ?? 0) + t.pl) * 100) / 100;
    }
    return map;
  }, [trades]);

  const moods = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of trades) {
      const k = dayKey(new Date(t.created_at));
      if (t.moods && t.moods.length) {
        const joined = t.moods.join(', ');
        map[k] = map[k] ? `${map[k]}, ${joined}` : joined;
      }
    }
    return map;
  }, [trades]);

  const handleOpenDay = (dateKey: string) => {
    const dayTrades = trades.filter((t) => dayKey(new Date(t.created_at)) === dateKey);
    if (dayTrades.length > 0) {
      setSelectedTrade(dayTrades[0]);
    } else {
      setAddVisible(true);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <CalendarScreen
        results={results}
        moods={moods}
        onOpenDay={handleOpenDay}
      />
      <AddTradeSheet visible={addVisible} onClose={() => setAddVisible(false)} onSaved={refresh} />
      <TradeDetailSheet trade={selectedTrade} onClose={() => setSelectedTrade(null)} />
    </View>
  );
}

