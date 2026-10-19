import { useState } from 'react';
import { View } from 'react-native';

import { AddTradeSheet } from '@/components/add-trade-sheet';
import { ConnectBrokerSheet } from '@/components/connect-broker-sheet';
import { HistoryImportSheet } from '@/components/history-import-sheet';
import { ImportReportSheet } from '@/components/import-report-sheet';
import { JournalSheet } from '@/components/journal-sheet';
import { ScreenshotTradeSheet } from '@/components/screenshot-trade-sheet';
import { useTrades } from '@/hooks/use-trades';
import HomeScreen from '../../design/home-screen';
import { colors } from '../../design/theme';

type Open = null | 'plan' | 'shot' | 'many' | 'hand' | 'connect' | 'import';

// The same home screen in BOTH designs; its colours follow the design mode. Its buttons open the real sheets.
export default function Index() {
  const { trades, refresh, live } = useTrades();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <HomeScreen
        tradeCount={trades.length}
        onPlan={() => setOpen('plan')}
        onScreenshot={() => setOpen('shot')}
        onMany={() => setOpen('many')}
        onManual={() => setOpen('hand')}
        onConnect={() => setOpen('connect')}
      />
      <JournalSheet visible={open === 'plan'} onClose={close} onSaved={refresh} />
      <ScreenshotTradeSheet visible={open === 'shot'} onClose={close} onSaved={refresh} />
      <HistoryImportSheet visible={open === 'many'} onClose={close} onSaved={refresh} />
      <AddTradeSheet visible={open === 'hand'} onClose={close} onSaved={refresh} />
      <ConnectBrokerSheet
        visible={open === 'connect'}
        onClose={close}
        trades={trades}
        live={live}
        onImportInstead={() => setOpen('import')}
      />
      <ImportReportSheet visible={open === 'import'} onClose={close} trades={trades} onImported={refresh} />
    </View>
  );
}
