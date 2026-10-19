import { Slot } from 'expo-router';

import AppTabs from '@/components/app-tabs';
import { TradesProvider } from '@/hooks/use-trades';
import { useDesignMode } from '../../design/mode';
import { ModeSwitchFloating } from '../../design/mode-switch';
import { AppShell } from '../../design/shell';

/**
 * Two designs, one app.
 *   dark  = the original design (bottom/top tabs, old screens in src/classic)
 *   white = the new design (hamburger shell, screens in src/design)
 * TradesProvider wraps both because the old screens read the shared trade list.
 */
export default function AppLayout() {
  const { mode } = useDesignMode();
  return (
    <TradesProvider>
      {mode === 'dark' ? (
        <>
          <AppTabs />
          <ModeSwitchFloating />
        </>
      ) : (
        <AppShell>
          <Slot />
        </AppShell>
      )}
    </TradesProvider>
  );
}
