import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { AddTradeSheet } from '@/components/add-trade-sheet';
import { ImportReportSheet } from '@/components/import-report-sheet';
import { TradeDetailSheet } from '@/components/trade-detail-sheet';
import { colors } from '../../design/theme';
import TradesScreen from '../../design/trades-screen';
import { useTrades } from '@/hooks/use-trades';
import { displaySetup } from '@/lib/setup-types';

export default function Trades() {
  const { trades, refresh } = useTrades();
  const [addVisible, setAddVisible] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const rows = useMemo(
    () =>
      trades.map((t) => ({
        id: t.id,
        date: new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        pair: t.pair,
        direction: t.direction === 'buy' ? 'Long' : 'Short',
        setup: t.setup_type ? displaySetup(t.setup_type) : '',
        mood: t.moods.length ? t.moods.join(', ') : '',
        result: Math.round(t.pl * 100) / 100,
      })),
    [trades],
  );

  const selected = trades.find((t) => t.id === selectedId) ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TradesScreen
        trades={rows}
        onAdd={() => setAddVisible(true)}
        onImport={() => setImportVisible(true)}
        onSelect={(id) => setSelectedId(Number(id))}
      />
      <AddTradeSheet visible={addVisible} onClose={() => setAddVisible(false)} onSaved={refresh} />
      <ImportReportSheet
        visible={importVisible}
        onClose={() => setImportVisible(false)}
        trades={trades}
        onImported={refresh}
      />
      <TradeDetailSheet trade={selected} onClose={() => setSelectedId(null)} />
    </View>
  );
}
