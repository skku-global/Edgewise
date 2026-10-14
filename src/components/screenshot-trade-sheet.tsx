/**
 * Add a trade from a screenshot of MetaTrader (history tab, a closed trade, an
 * open position).
 *
 * The AI reads the numbers it can see, and the form shows them for you to check
 * and fix. Nothing is saved until you press "Save trade", because an AI can
 * misread a digit. Only the numbers are saved, not the image itself.
 */

import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MoodPicker } from '@/components/mood-picker';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Dropdown } from '@/components/ui/dropdown';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import type { Theme } from '@/constants/theme';
import { formatSigned } from '@/lib/format';
import { extractTradeFromImage } from '@/lib/journal';
import type { MoodValue } from '@/lib/moods';
import { readMotionFlag } from '@/lib/motion-sensor';
import { SETUP_TYPES } from '@/lib/setup-types';
import { useThemedStyles } from '@/lib/styles';
import { supabase } from '@/lib/supabase';
import { computeProfitLoss } from '@/lib/trade-math';

type Direction = 'buy' | 'sell';

const SETUP_OPTIONS = SETUP_TYPES.map((setup) => ({ label: setup, value: setup as string | null }));

type ScreenshotTradeSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  pair: string;
  direction: Direction;
  entry_price: string;
  exit_price: string;
  size: string;
  profit_loss: string;
  setup_type: string | null;
  notes: string;
};

const initialForm: FormState = {
  pair: '',
  direction: 'buy',
  entry_price: '',
  exit_price: '',
  size: '',
  profit_loss: '',
  setup_type: null,
  notes: '',
};

type Errors = Partial<Record<keyof FormState, string>>;

const text = (value: number | null) => (value === null ? '' : String(value));

export function ScreenshotTradeSheet({ visible, onClose, onSaved }: ScreenshotTradeSheetProps) {
  const styles = useThemedStyles(sheet);

  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Errors>({});
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedTradeId, setSavedTradeId] = useState<number | null>(null);
  const [savedPl, setSavedPl] = useState<number | null>(null);
  const [mood, setMood] = useState<MoodValue | null>(null);
  const [moodSaving, setMoodSaving] = useState(false);
  const [moodError, setMoodError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setForm(initialForm);
      setErrors({});
      setReading(false);
      setRead(false);
      setError(null);
      setSavedTradeId(null);
      setSavedPl(null);
      setMood(null);
      setMoodError(null);
    }
  }, [visible]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const pickScreenshot = async () => {
    setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) {
        return;
      }
      const asset = picked.assets[0];

      setReading(true);
      const found = await extractTradeFromImage(asset.uri, asset.mimeType ?? undefined);
      setForm({
        pair: found.pair ?? '',
        direction: found.direction ?? 'buy',
        entry_price: text(found.entry_price),
        exit_price: text(found.exit_price),
        size: text(found.size),
        profit_loss: text(found.profit_loss),
        setup_type: null,
        notes: found.notes ?? '',
      });
      setRead(true);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not read that screenshot. Try again.');
    } finally {
      setReading(false);
    }
  };

  const handleSave = async () => {
    const found: Errors = {};
    if (!form.pair.trim()) found.pair = 'Which pair?';
    for (const key of ['entry_price', 'exit_price', 'size'] as const) {
      const value = Number(form[key]);
      if (!form[key].trim()) found[key] = 'Required';
      else if (!Number.isFinite(value) || value <= 0) found[key] = 'Number above 0';
    }
    if (form.profit_loss.trim() && !Number.isFinite(Number(form.profit_loss))) {
      found.profit_loss = 'Numbers only';
    }
    setErrors(found);
    setError(null);
    if (Object.keys(found).length > 0) {
      return;
    }

    setSaving(true);
    try {
      const entry = Number(form.entry_price);
      const exit = Number(form.exit_price);
      const size = Number(form.size);
      // Use the P/L read from the screenshot when there is one, because it
      // includes spread and commission. Otherwise calculate it from the prices.
      const pl = form.profit_loss.trim()
        ? Number(form.profit_loss)
        : computeProfitLoss({ direction: form.direction, entry_price: entry, exit_price: exit, size });

      const { data, error: insertError } = await supabase
        .from('trades')
        .insert([
          {
            pair: form.pair.trim().toUpperCase(),
            direction: form.direction,
            entry_price: entry,
            exit_price: exit,
            size,
            profit_loss: pl,
            setup_type: form.setup_type,
            notes: form.notes.trim() || null,
          },
        ])
        .select('id');
      if (insertError) {
        throw insertError;
      }

      setSavedTradeId(data?.[0]?.id ?? null);
      setSavedPl(pl);
      onSaved();
    } catch (err) {
      console.error(err);
      setError('Unable to save the trade right now. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleMood = async (value: MoodValue) => {
    if (!savedTradeId) {
      return;
    }
    setMoodSaving(true);
    setMoodError(null);
    try {
      const motionFlag = await readMotionFlag();
      const { error: moodInsertError } = await supabase
        .from('moods')
        .insert([{ trade_id: savedTradeId, mood_tag: value, motion_flag: motionFlag }]);
      if (moodInsertError) {
        throw moodInsertError;
      }
      setMood(value);
      onSaved();
    } catch (err) {
      console.error(err);
      setMoodError('Unable to save your mood right now.');
    } finally {
      setMoodSaving(false);
    }
  };

  const saved = savedTradeId !== null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={saved ? 'Trade saved' : 'Add from a screenshot'}
      subtitle={
        saved
          ? 'One question left: how did you feel?'
          : 'Upload a MetaTrader screenshot. Check the numbers before saving.'
      }
      footer={
        saved ? (
          <Button
            label={mood ? 'Done' : 'Done without a mood'}
            variant={mood ? 'primary' : 'secondary'}
            size="lg"
            block
            onPress={onClose}
          />
        ) : read ? (
          <Button label="Save trade" size="lg" block loading={saving} onPress={handleSave} />
        ) : (
          <Button label="Choose a screenshot" size="lg" block loading={reading} onPress={pickScreenshot} />
        )
      }
    >
      {saved ? (
        <View style={styles.stack}>
          <Card style={styles.card}>
            <ThemedText variant="overline" tone="textTertiary">
              LOGGED
            </ThemedText>
            <ThemedText variant="monoXl" tone={savedPl !== null && savedPl >= 0 ? 'gain' : 'loss'}>
              {formatSigned(savedPl ?? 0)}
            </ThemedText>
          </Card>
          <View>
            <SectionHeader title="How did you feel?" />
            <Card style={styles.card}>
              <MoodPicker value={mood} onChange={handleMood} disabled={moodSaving} />
              {mood ? (
                <ThemedText variant="caption" tone="gain">
                  Saved.
                </ThemedText>
              ) : null}
              {moodError ? (
                <ThemedText variant="caption" tone="loss">
                  {moodError}
                </ThemedText>
              ) : null}
            </Card>
          </View>
        </View>
      ) : !read ? (
        <View style={styles.stack}>
          <ThemedText variant="body" tone="textSecondary">
            Pick a screenshot of your MetaTrader history, a closed trade, or an open position. The
            app reads the pair, direction, prices, lots and result, then shows them for you to
            confirm. It reads one trade at a time, so upload again for the next one.
          </ThemedText>
          {reading ? (
            <ThemedText variant="caption" tone="textTertiary">
              Reading your screenshot…
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
      ) : (
        <View style={styles.stack}>
          <ThemedText variant="caption" tone="textTertiary">
            Check every number against your screenshot. AI can misread a digit.
          </ThemedText>

          <Field
            label="Pair"
            value={form.pair}
            onChangeText={(value) => set('pair', value)}
            autoCapitalize="characters"
            autoCorrect={false}
            error={errors.pair}
            editable={!saving}
          />

          <View style={styles.row}>
            {(['buy', 'sell'] as Direction[]).map((direction) => {
              const active = form.direction === direction;
              return (
                <Pressable
                  key={direction}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => set('direction', direction)}
                  style={({ pressed }) => [
                    styles.segment,
                    active && (direction === 'buy' ? styles.segmentBuy : styles.segmentSell),
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText variant="label" tone={active ? 'textOnFill' : 'text'}>
                    {direction.toUpperCase()}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.row}>
            <Field
              label="Entry price"
              value={form.entry_price}
              onChangeText={(value) => set('entry_price', value)}
              keyboardType="decimal-pad"
              numeric
              error={errors.entry_price}
              containerStyle={styles.flexOne}
            />
            <Field
              label="Exit price"
              value={form.exit_price}
              onChangeText={(value) => set('exit_price', value)}
              keyboardType="decimal-pad"
              numeric
              error={errors.exit_price}
              containerStyle={styles.flexOne}
            />
          </View>

          <View style={styles.row}>
            <Field
              label="Size (lots)"
              value={form.size}
              onChangeText={(value) => set('size', value)}
              keyboardType="decimal-pad"
              numeric
              error={errors.size}
              containerStyle={styles.flexOne}
            />
            <Field
              label="Profit / loss"
              value={form.profit_loss}
              onChangeText={(value) => set('profit_loss', value)}
              keyboardType="numbers-and-punctuation"
              numeric
              error={errors.profit_loss}
              hint="Blank = calculated from prices"
              containerStyle={styles.flexOne}
            />
          </View>

          <View style={styles.group}>
            <ThemedText variant="label" tone="textSecondary">
              Setup type (optional)
            </ThemedText>
            <Dropdown
              value={form.setup_type}
              options={SETUP_OPTIONS}
              onChange={(value) => set('setup_type', value)}
              placeholder="Select a setup"
            />
          </View>

          <Field
            label="Notes"
            value={form.notes}
            onChangeText={(value) => set('notes', value)}
            multiline
            inputStyle={styles.textArea}
            editable={!saving}
          />

          {error ? (
            <View style={styles.errorBanner}>
              <ThemedText variant="label" tone="loss">
                {error}
              </ThemedText>
            </View>
          ) : null}

          <Button
            label="Choose a different screenshot"
            variant="secondary"
            loading={reading}
            disabled={saving}
            onPress={pickScreenshot}
          />
        </View>
      )}
    </Sheet>
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
    group: {
      gap: t.space.one,
    },
    row: {
      flexDirection: 'row',
      gap: t.space.two,
    },
    flexOne: {
      flex: 1,
    },
    segment: {
      flex: 1,
      height: 48,
      borderRadius: t.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.borderStrong,
      backgroundColor: t.color.bgSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentBuy: {
      backgroundColor: t.color.gain,
      borderColor: t.color.gain,
    },
    segmentSell: {
      backgroundColor: t.color.loss,
      borderColor: t.color.loss,
    },
    pressed: {
      opacity: 0.75,
    },
    textArea: {
      height: 88,
      paddingTop: t.space.two,
      textAlignVertical: 'top',
    },
    errorBanner: {
      backgroundColor: t.color.lossSoft,
      borderColor: t.color.loss,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: t.radius.md,
      padding: t.space.three,
    },
  });
