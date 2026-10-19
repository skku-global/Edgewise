/**
 * The signed-in shell.
 *
 * `TradesProvider` sits above the tabs rather than inside any screen because
 * four of them read the same trade list. When each ran its own copy of the hook
 * they also each opened a realtime channel on the same topic, and supabase-js
 * hands back an already-subscribed channel for a topic it knows — so the second
 * tab to mount crashed on `.on()`. See the header of `use-trades.tsx`.
 */

import AppTabs from '@/components/app-tabs';
import { TradesProvider } from '@/hooks/use-trades';

export default function AppLayout() {
  return (
    <TradesProvider>
      <AppTabs />
    </TradesProvider>
  );
}
