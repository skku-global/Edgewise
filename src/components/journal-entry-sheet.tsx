/**
 * Re-exports or wraps JournalSheet for inspecting and editing an existing entry.
 */

import { JournalSheet } from '@/components/journal-sheet';
import type { JournalEntry } from '@/lib/journal';

type JournalEntrySheetProps = {
  entry: JournalEntry | null;
  onClose: () => void;
  onChanged: () => void;
};

export function JournalEntrySheet({ entry, onClose, onChanged }: JournalEntrySheetProps) {
  if (!entry) return null;

  const initialPhase =
    entry.status === 'closed' ? 'after' : entry.status === 'open' ? 'during' : 'before';

  return (
    <JournalSheet
      visible={!!entry}
      initialEntry={entry}
      initialPhase={initialPhase}
      onClose={onClose}
      onSaved={onChanged}
    />
  );
}
