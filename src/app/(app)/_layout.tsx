import { Slot } from 'expo-router';
import { AppShell } from '../../design/shell';

// WIRE: if your old layout had an auth redirect or providers, restore them here.
// Old file: .redesign-backup/_layout.tsx.bak
export default function AppLayout() {
  return (
    <AppShell>
      <Slot />
    </AppShell>
  );
}
