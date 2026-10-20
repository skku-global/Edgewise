/**
 * Add MANY trades at once from several MetaTrader history screenshots.
 *
 * Pick up to 6 screenshots. The AI reads every closed trade it can see, the list
 * shows them for you to check, and only the ones that are ticked are saved.
 * Trades you already have (same pair, prices and lots) are unticked for you.
 * Nothing is saved until you press the save button.
 */

import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import type { Theme } from '@/constants/theme';
import { formatSigned } from '@/lib/format';
import { extractTradesFromImages, MAX_IMAGES, type HistoryTrade } from '@/lib/plan-vision';
import { useThemedStyles } from '@/lib/styles';
import { supabase } from '@/lib/supabase';
import { computeProfitLoss } from '@/lib/trade-math';

type Row = {
  trade: HistoryTrade;
  /** Why this row cannot be saved, or null. */
  problem: string | null;
  duplicate: boolean;
  checked: boolean;
};

type HistoryImportSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const keyOf = (pair: string, entry: number, exit: number, size: number) =>
  `${pair}|${entry}|${exit}|${size}`;

function problemOf(t: HistoryTrade): string | null {
  if (!t.pair) return 'No pair read';
  if (!t.direction) return 'No buy/sell read';
  if (t.entry_price === null || t.exit_price === null || t.size === null) return 'A number was unclear';
  if (t.entry_price <= 0 || t.exit_price <= 0 || t.size <= 0) return 'A number was unclear';
  return null;
}

export function HistoryImportSheet({ visible, onClose, onSaved }: HistoryImportSheetProps) {
  const styles = useThemedStyles(sheet);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) {
      setRows(null);
      setReading(false);
      setSaving(false);
      setError(null);
      setSavedCount(null);
    }
  }, [visible]);

  const choose = async () => {
    setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.length) {
        return;
      }
      setReading(true);
      const images = picked.assets.slice(0, MAX_IMAGES).map((asset) => ({
        uri: asset.uri,
        mime: asset.mimeType && asset.mimeType.startsWith('image/') ? asset.mimeType : 'image/jpeg',
        name: asset.name ?? 'screenshot',
      }));
      const found = await extractTradesFromImages(images);
      if (found.length === 0) {
        throw new Error('No closed trades were found in those screenshots. Try the History tab, zoomed in.');
      }

      // Untick anything that is already saved.
      const { data } = await supabase
        .from('trades')
        .select('pair, entry_price, exit_price, size')
        .order('created_at', { ascending: false })
        .limit(500);
      const existing = new Set(
        ((data ?? []) as Record<string, unknown>[]).map((r) =>
          keyOf(String(r.pair).toUpperCase(), Number(r.entry_price), Number(r.exit_price), Number(r.size)),
        ),
      );

      setRows(
        found.map((trade) => {
          const problem = problemOf(trade);
          const duplicate =
            !problem &&
            existing.has(keyOf(trade.pair!, trade.entry_price!, trade.exit_price!, trade.size!));
          return { trade, problem, duplicate, checked: !problem && !duplicate };
        }),
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not read those screenshots. Try again.');
    } finally {
      setReading(false);
    }
  };

  const toggle = (index: number) =>
    setRows((current) =>
      current
        ? current.map((row, i) => (i === index && !row.problem ? { ...row, checked: !row.checked } : row))
        : current,
    );

  const chosen = rows?.filter((row) => row.checked) ?? [];

  const save = async () => {
    if (chosen.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const payload = chosen.map(({ trade }) => ({
        pair: trade.pair!,
        direction: trade.direction!,
        entry_price: trade.entry_price!,
        exit_price: trade.exit_price!,
        size: trade.size!,
        // Prefer the P/L read from the screenshot: it includes spread and commission.
        profit_loss:
          trade.profit_loss ??
          computeProfitLoss({
            direction: trade.direction!,
            entry_price: trade.entry_price!,
            exit_price: trade.exit_price!,
            size: trade.size!,
          }),
        setup_type: null,
        log_method: 'history',
        notes: trade.closed_at ? `Imported from a history screenshot (${trade.closed_at})` : 'Imported from a history screenshot',
      }));
      const { error: insertError } = await supabase.from('trades').insert(payload);
      if (insertError) throw insertError;
      setSavedCount(payload.length);
      onSaved();
    } catch (err) {
      console.error(err);
      setError('Unable to save the trades right now. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={savedCount !== null ? 'Trades saved' : 'Add many trades'}
      subtitle={
        savedCount !== null
          ? `${savedCount} ${savedCount === 1 ? 'trade' : 'trades'} added to your journal.`
          : 'Upload several MetaTrader history screenshots. Check the list before saving.'
      }
      footer={
        savedCount !== null ? (
          <Button label="Done" size="lg" block onPress={onClose} />
        ) : rows ? (
          <Button
            label={chosen.length ? `Save ${chosen.length} ${chosen.length === 1 ? 'trade' : 'trades'}` : 'Tick at least one trade'}
            size="lg"
            block
            loading={saving}
            disabled={chosen.length === 0}
            onPress={save}
          />
        ) : (
          <Button label="Choose screenshots" size="lg" block loading={reading} onPress={choose} />
        )
      }
    >
      <View style={styles.stack}>
        {!rows ? (
          <ThemedText variant="body" tone="textSecondary">
            Pick up to {MAX_IMAGES} screenshots of your history tab at once. Every closed trade the app can
            read shows up in a list. Trades you already saved are unticked so nothing is added twice.
          </ThemedText>
        ) : savedCount === null ? (
          <>
            <ThemedText variant="caption" tone="textTertiary">
              Check each row against your screenshot. AI can misread a digit. Untick anything wrong.
            </ThemedText>
            <Card flush>
              {rows.map((row, index) => {
                const t = row.trade;
                const pl =
                  t.profit_loss ??
                  (row.problem
                    ? null
                    : computeProfitLoss({
                        direction: t.direction!,
                        entry_price: t.entry_price!,
                        exit_price: t.exit_price!,
                        size: t.size!,
                      }));
                return (
                  <View key={`${t.pair}-${index}`}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: row.checked, disabled: !!row.problem }}
                      onPress={() => toggle(index)}
                      style={({ pressed }) => [styles.row, pressed && styles.pressed, !!row.problem && styles.dim]}
                    >
                      <View style={[styles.box, row.checked && styles.boxOn]}>
                        {row.checked ? (
                          <ThemedText variant="label" tone="textOnFill">
                            ✓
                          </ThemedText>
                        ) : null}
                      </View>
                      <View style={styles.rowMain}>
                        <ThemedText variant="bodyStrong">{t.pair ?? '?'}</ThemedText>
                        <ThemedText variant="caption" tone="textTertiary">
                          {t.entry_price ?? '?'} → {t.exit_price ?? '?'} · {t.size ?? '?'} lots
                        </ThemedText>
                        {row.problem ? (
                          <ThemedText variant="caption" tone="loss">
                            {row.problem}, so this one is skipped
                          </ThemedText>
                        ) : row.duplicate ? (
                          <ThemedText variant="caption" tone="textSecondary">
                            Already in your journal
                          </ThemedText>
                        ) : null}
                      </View>
                      {t.direction ? (
                        <Pill label={t.direction} tone={t.direction === 'buy' ? 'gain' : 'loss'} solid caps />
                      ) : null}
                      {pl !== null ? (
                        <ThemedText variant="mono" tone={pl >= 0 ? 'gain' : 'loss'}>
                          {formatSigned(pl)}
                        </ThemedText>
                      ) : null}
                    </Pressable>
                  </View>
                );
              })}
            </Card>
          </>
        ) : null}

        {reading ? (
          <ThemedText variant="caption" tone="textTertiary">
            Reading your screenshots…
          </ThemedText>
        ) : null}
        {error ? (
          <View style={styles.errorBanner}>
            <ThemedText variant="label" tone="loss">
              {error}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    stack: {
      gap: t.space.three,
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
    dim: {
      opacity: 0.5,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.color.border,
    },
    box: {
      width: 24,
      height: 24,
      borderRadius: t.radius.xs,
      borderWidth: 1,
      borderColor: t.color.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxOn: {
      backgroundColor: t.color.accent,
      borderColor: t.color.accent,
    },
    errorBanner: {
      padding: t.space.three,
      borderRadius: t.radius.md,
      backgroundColor: t.color.lossSoft,
    },
  });
