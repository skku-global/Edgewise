/**
 * The Add Trade form, in a full-screen sheet so the Trades screen can show the
 * table without burying it under a form on every visit.
 *
 * Same validation and stored-P/L behaviour as before, with two changes worth
 * naming:
 *
 *   - Validation is per field rather than one `Alert.alert('Missing fields')`.
 *     A modal alert names none of the offending inputs and has to be dismissed
 *     before the user can act on it; an inline error points at the field.
 *   - Saving shows an inline notice instead of an alert. The mood question that
 *     follows a save was previously announced by an alert and then rendered
 *     below the fold, so it was routinely missed — which is how trades ended up
 *     with no mood in the first place.
 */

import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { MoodPicker } from '@/components/mood-picker';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Dropdown } from '@/components/ui/dropdown';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import type { Theme } from '@/constants/theme';
import { formatSigned } from '@/lib/format';
import type { MoodValue } from '@/lib/moods';
import { readMotionFlag } from '@/lib/motion-sensor';
import { SETUP_TYPES } from '@/lib/setup-types';
import { useThemedStyles } from '@/lib/styles';
import { supabase } from '@/lib/supabase';
import { computeProfitLoss } from '@/lib/trade-math';

type TradeDirection = 'buy' | 'sell';

const SETUP_OPTIONS = SETUP_TYPES.map((setup) => ({ label: setup, value: setup as string | null }));

type AddTradeSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  pair: string;
  direction: TradeDirection;
  entry_price: string;
  exit_price: string;
  size: string;
  setup_type: string | null;
  notes: string;
};

const initialForm: FormState = {
  pair: '',
  direction: 'buy',
  entry_price: '',
  exit_price: '',
  size: '',
  setup_type: null,
  notes: '',
};

/** Field-keyed validation errors. Empty object means the form is valid. */
type Errors = Partial<Record<keyof FormState, string>>;

/**
 * `Number('')` is 0 and `Number('abc')` is NaN, so a blank and a typo would both
 * sail through a plain `Number(...)` check — the first storing a 0 price, the
 * second an insert that fails at the database. Both are caught here.
 */
function validate(form: FormState): Errors {
  const errors: Errors = {};

  if (!form.pair.trim()) {
    errors.pair = 'Which pair did you trade?';
  }
  for (const key of ['entry_price', 'exit_price', 'size'] as const) {
    const raw = form[key];
    if (!raw.trim()) {
      errors[key] = 'Required';
    } else if (!Number.isFinite(Number(raw))) {
      errors[key] = 'Numbers only';
    } else if (Number(raw) <= 0) {
      errors[key] = 'Must be above 0';
    }
  }
  if (!form.setup_type) {
    errors.setup_type = 'Pick a setup';
  }

  return errors;
}

export function AddTradeSheet({ visible, onClose, onSaved }: AddTradeSheetProps) {
  const styles = useThemedStyles(sheet);

  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [savedTradeId, setSavedTradeId] = useState<number | null>(null);
  const [savedPl, setSavedPl] = useState<number | null>(null);
  const [selectedMood, setSelectedMood] = useState<MoodValue | null>(null);
  const [moodSaving, setMoodSaving] = useState(false);
  const [moodError, setMoodError] = useState<string | null>(null);

  // Cleared on close, not on open: resetting on open would wipe a form the user
  // is returning to after backgrounding the app.
  useEffect(() => {
    if (!visible) {
      setForm(initialForm);
      setErrors({});
      setSaveError(null);
      setSavedTradeId(null);
      setSavedPl(null);
      setSelectedMood(null);
      setMoodError(null);
    }
  }, [visible]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    // Clear just this field's error, so fixing one input does not blank the
    // messages still pointing at the others.
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const handleSubmit = async () => {
    const found = validate(form);
    setErrors(found);
    setSaveError(null);

    if (Object.keys(found).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      const entryPrice = Number(form.entry_price);
      const exitPrice = Number(form.exit_price);
      const size = Number(form.size);
      // Stored up front so the dashboard reads a real value instead of
      // re-deriving it from the price columns on every load.
      const pl = computeProfitLoss({
        direction: form.direction,
        entry_price: entryPrice,
        exit_price: exitPrice,
        size,
      });

      const { data, error } = await supabase
        .from('trades')
        .insert([
          {
            pair: form.pair.trim().toUpperCase(),
            direction: form.direction,
            entry_price: entryPrice,
            exit_price: exitPrice,
            size,
            profit_loss: pl,
            setup_type: form.setup_type,
            notes: form.notes.trim() || null,
          },
        ])
        .select('id');

      if (error) {
        throw error;
      }

      setForm(initialForm);
      setSavedTradeId(data?.[0]?.id ?? null);
      setSavedPl(pl);
      setSelectedMood(null);
      setMoodError(null);
      onSaved();
    } catch (err) {
      console.error(err);
      setSaveError('Unable to save the trade right now. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMoodSelect = async (mood: MoodValue) => {
    if (!savedTradeId) {
      return;
    }

    setMoodSaving(true);
    setMoodError(null);

    try {
      const motionFlag = await readMotionFlag();

      const { error } = await supabase
        .from('moods')
        .insert([{ trade_id: savedTradeId, mood_tag: mood, motion_flag: motionFlag }]);

      if (error) {
        throw error;
      }

      setSelectedMood(mood);
      onSaved();
    } catch (err) {
      console.error(err);
      setMoodError('Unable to save your mood right now.');
    } finally {
      setMoodSaving(false);
    }
  };

  // After a save the form is replaced by the mood question, so the footer's
  // primary action changes with it.
  const saved = savedTradeId !== null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={saved ? 'Trade saved' : 'Add a trade'}
      subtitle={
        saved
          ? 'One question left — the one your broker cannot answer.'
          : 'The numbers, then how you felt taking it.'
      }
      footer={
        saved ? (
          <Button
            label={selectedMood ? 'Done' : 'Done without a mood'}
            variant={selectedMood ? 'primary' : 'secondary'}
            size="lg"
            block
            onPress={onClose}
          />
        ) : (
          <Button
            testID="save-trade"
            label="Save trade"
            size="lg"
            block
            loading={submitting}
            onPress={handleSubmit}
          />
        )
      }
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {saved ? (
          <View style={styles.savedBlock}>
            <View style={styles.plCard}>
              <ThemedText variant="overline" tone="heroMuted">
                LOGGED
              </ThemedText>
              <ThemedText
                variant="monoXl"
                tone={savedPl !== null && savedPl >= 0 ? 'gain' : 'loss'}
              >
                {formatSigned(savedPl ?? 0)}
              </ThemedText>
            </View>

            <View>
              <SectionHeader
                title="How did you feel?"
                subtitle="Logged against this trade, and read by the mood pattern on your dashboard."
              />
              <Card style={styles.moodCard}>
                <MoodPicker
                  value={selectedMood}
                  onChange={handleMoodSelect}
                  disabled={moodSaving}
                />
                {selectedMood ? (
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
        ) : (
          <View style={styles.form}>
            <Field
              label="Pair"
              value={form.pair}
              onChangeText={(value) => set('pair', value)}
              placeholder="XAUUSD"
              autoCapitalize="characters"
              autoCorrect={false}
              error={errors.pair}
              editable={!submitting}
              testID="pair-input"
            />

            <View style={styles.group}>
              <ThemedText variant="label" tone="textSecondary">
                Direction
              </ThemedText>
              <View style={styles.segmentRow}>
                {(['buy', 'sell'] as TradeDirection[]).map((direction) => (
                  <Segment
                    key={direction}
                    direction={direction}
                    active={form.direction === direction}
                    disabled={submitting}
                    onPress={() => set('direction', direction)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.row}>
              <Field
                label="Entry price"
                value={form.entry_price}
                onChangeText={(value) => set('entry_price', value)}
                placeholder="0"
                keyboardType="decimal-pad"
                numeric
                error={errors.entry_price}
                editable={!submitting}
                containerStyle={styles.flexOne}
                testID="entry-input"
              />
              <Field
                label="Exit price"
                value={form.exit_price}
                onChangeText={(value) => set('exit_price', value)}
                placeholder="0"
                keyboardType="decimal-pad"
                numeric
                error={errors.exit_price}
                editable={!submitting}
                containerStyle={styles.flexOne}
                testID="exit-input"
              />
            </View>

            <View style={styles.row}>
              <Field
                label="Size (lots)"
                value={form.size}
                onChangeText={(value) => set('size', value)}
                placeholder="0.1"
                keyboardType="decimal-pad"
                numeric
                error={errors.size}
                editable={!submitting}
                containerStyle={styles.flexOne}
                testID="size-input"
              />

              <View style={[styles.group, styles.flexOne]}>
                <ThemedText variant="label" tone="textSecondary">
                  Setup type
                </ThemedText>
                <Dropdown
                  value={form.setup_type}
                  options={SETUP_OPTIONS}
                  onChange={(value) => set('setup_type', value)}
                  placeholder="Select a setup"
                  testID="setup-dropdown"
                />
                {errors.setup_type ? (
                  <ThemedText variant="caption" tone="loss">
                    {errors.setup_type}
                  </ThemedText>
                ) : null}
              </View>
            </View>

            <Field
              label="Notes"
              value={form.notes}
              onChangeText={(value) => set('notes', value)}
              placeholder="What did you see? What were you thinking?"
              multiline
              editable={!submitting}
              inputStyle={styles.textArea}
              hint="Optional."
              testID="notes-input"
            />

            {saveError ? (
              <View style={styles.errorBanner}>
                <ThemedText variant="label" tone="loss">
                  {saveError}
                </ThemedText>
              </View>
            ) : null}
          </View>
        )}
      </KeyboardAvoidingView>
    </Sheet>
  );
}

/**
 * Buy/sell segment. Buy fills green and sell fills red, which is the one place
 * in the app those colours mean direction rather than outcome — but it is what
 * every trading platform does, so matching it costs nothing and reads instantly.
 */
function Segment({
  direction,
  active,
  disabled,
  onPress,
}: {
  direction: TradeDirection;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(sheet);

  return (
    <Pressable
      testID={`direction-${direction}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segment,
        active && (direction === 'buy' ? styles.segmentBuy : styles.segmentSell),
        pressed && styles.segmentPressed,
      ]}
    >
      <ThemedText variant="label" tone={active ? 'textOnFill' : 'text'}>
        {direction.toUpperCase()}
      </ThemedText>
    </Pressable>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    form: {
      gap: t.space.three,
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
    segmentRow: {
      flexDirection: 'row',
      gap: t.space.two,
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
    segmentPressed: {
      opacity: 0.75,
    },
    // Height rather than minHeight, and top-aligned text: a multiline input that
    // grows as you type pushes the Save button around under your thumb.
    textArea: {
      height: 104,
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
    savedBlock: {
      gap: t.space.three,
    },
    plCard: {
      backgroundColor: t.color.hero,
      borderRadius: t.radius.xl,
      padding: t.space.four,
      gap: t.space.one,
      alignItems: 'flex-start',
    },
    moodCard: {
      gap: t.space.two,
    },
  });
