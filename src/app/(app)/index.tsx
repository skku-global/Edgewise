import { useState } from 'react';
import { View } from 'react-native';

import { ConnectBrokerSheet } from '@/components/connect-broker-sheet';
import { ImportReportSheet } from '@/components/import-report-sheet';
import { JournalSheet } from '@/components/journal-sheet';
import { useTrades } from '@/hooks/use-trades';
import { displayName, useSession } from '@/lib/session';
import HomeScreen from '../../design/home-screen';
import { colors } from '../../design/theme';

type OpenModal = null | 'manual' | 'auto' | 'import';

export default function Index() {
  const { trades, refresh, live } = useTrades();
  const { user } = useSession();
  const [open, setOpen] = useState<OpenModal>(null);
  const close = () => setOpen(null);

  const userName = user ? displayName(user) : 'Trader';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <HomeScreen
        tradeCount={trades.length}
        userName={userName}
        onManual={() => setOpen('manual')}
        onAuto={() => setOpen('auto')}
      />

      {/* Unified manual trade & journal sheet: Before / During / After */}
      <JournalSheet visible={open === 'manual'} onClose={close} onSaved={refresh} />

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
    </View>
  );
}
