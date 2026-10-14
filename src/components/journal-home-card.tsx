/**
 * The "ways to add a trade" block for the home page, plus your open plans.
 * Self-contained: it mounts its own sheets, so the home screen only needs
 *   <JournalHomeCard onChanged={refresh} onConnect={() => setConnectVisible(true)} />
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AddTradeSheet } from '@/components/add-trade-sheet';
import { JournalEntrySheet } from '@/components/journal-entry-sheet';
import { gradeTone, JournalSheet } from '@/components/journal-sheet';
import { ScreenshotTradeSheet } from '@/components/screenshot-trade-sheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import type { Theme } from '@/constants/theme';
import { formatShortDate } from '@/lib/format';
import { listOpenEntries, type JournalEntry } from '@/lib/journal';
import { useThemedStyles } from '@/lib/styles';

type JournalHomeCardProps = {
  /** Called after anything is saved, so the home screen can reload its trades. */
  onChanged: () => void;
  onConnect: () => void;
};

export function JournalHomeCard({ onChanged, onConnect }: JournalHomeCardProps) {
  const styles = useThemedStyles(sheet);

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [planVisible, setPlanVisible] = useState(false);
  const [shotVisible, setShotVisible] = useState(false);
  const [handVisible, setHandVisible] = useState(false);
  const [selected, setSelected] = useState<JournalEntry | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoadError(null);
      setEntries(await listOpenEntries());
    } catch (err) {
      console.error(err);
      setLoadError(
        'Could not load your journal. If you have not yet, run scripts/create-journal-table.sql in the Supabase SQL editor.',
      );
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const changed = useCallback(() => {
    reload();
    onChanged();
  }, [reload, onChanged]);

  return (
    <View style={styles.stack}>
      <View>
        <SectionHeader title="Journal" subtitle="Plan it before, talk it through, review it after." />
        <Card style={styles.card}>
          <Button label="Plan a trade (voice or text)" onPress={() => setPlanVisible(true)} />
          <Button label="Add from a screenshot" variant="secondary" onPress={() => setShotVisible(true)} />
          <Button label="Add a trade by hand" variant="secondary" onPress={() => setHandVisible(true)} />
          <Button label="Connect MetaTrader (auto-sync)" variant="secondary" onPress={onConnect} />
        </Card>
      </View>

      {loadError ? (
        <ThemedText variant="caption" tone="loss">
          {loadError}
        </ThemedText>
      ) : null}

      {entries.length > 0 ? (
        <View>
          <SectionHeader title="Open plans" subtitle="Tap one to check in or close it out." />
          <Card flush>
            {entries.map((entry, index) => (
              <View key={entry.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSelected(entry)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={styles.rowMain}>
                    <ThemedText variant="bodyStrong">{entry.pair}</ThemedText>
                    <ThemedText variant="caption" tone="textTertiary">
                      {formatShortDate(entry.created_at)} · {entry.status}
                      {entry.checkins.length > 0 ? ` · ${entry.checkins.length} check-in` : ''}
                    </ThemedText>
                  </View>
                  <Pill label={entry.direction} tone={entry.direction === 'buy' ? 'gain' : 'loss'} solid caps />
                  {entry.grade ? <Pill label={entry.grade} tone={gradeTone(entry.grade)} /> : null}
                </Pressable>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <JournalSheet visible={planVisible} onClose={() => setPlanVisible(false)} onSaved={changed} />
      <ScreenshotTradeSheet visible={shotVisible} onClose={() => setShotVisible(false)} onSaved={changed} />
      <AddTradeSheet visible={handVisible} onClose={() => setHandVisible(false)} onSaved={changed} />
      <JournalEntrySheet entry={selected} onClose={() => setSelected(null)} onChanged={changed} />
    </View>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    stack: {
      gap: t.space.three,
    },
    card: {
      gap: t.space.two,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.two,
      paddingHorizontal: t.space.three,
      paddingVertical: t.space.three,
    },
    rowMain: {
      flex: 1,
      gap: t.space.half,
    },
    pressed: {
      backgroundColor: t.color.surfaceActive,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.color.border,
    },
  });
