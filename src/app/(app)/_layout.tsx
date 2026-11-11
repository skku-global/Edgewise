import { Slot } from 'expo-router';

import AppTabs from '@/components/app-tabs';
import { TradesProvider } from '@/hooks/use-trades';
import { useDesignMode } from '../../design/mode';
import { AppShell } from '../../design/shell';

/**
 * Two designs, one set of screens.
 *   dark  = native tabs / the web top bar from `components/app-tabs*`
 *   white = the `AppShell` header with its hamburger menu
 * Both render the same route files, which draw from `src/design`; only the
 * frame around them changes. TradesProvider sits above both so a mode switch
 * does not refetch and does not drop the realtime channel.
 */
export default function AppLayout() {
  const { mode } = useDesignMode();
  return (
    <TradesProvider>
      {mode === 'dark' ? (
        <AppTabs />
      ) : (
        <AppShell>
          <Slot />
        </AppShell>
      )}
    </TradesProvider>
  );
}
