/**
 * Plan a trade BEFORE taking it.
 *
 * You write (or speak) your reasons and how you feel. The app then:
 *   1. checks warnings with plain arithmetic: no stop, lot size far above your
 *      usual, bad risk to reward
 *   2. asks the AI whether your reasons show each of YOUR rules
 *   3. gives a grade from how many rules were met, capped when there is a warning
 * Nothing is saved until you press "Save plan".
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import { VoiceButton } from '@/components/voice-button';
import { VoiceQueueBanner } from '@/components/voice-queue-banner';
import type { Theme } from '@/constants/theme';
import {
  computeFlags,
  DEFAULT_RULES,
  gradePlan,
  insertEntry,
  loadRules,
  parseRules,
  saveRules,
  usualLotSize,
  type Direction,
  type GradeOutcome,
  type PlanInput,
} from '@/lib/journal';
import { extractPlanFromImages, pickScreenshots } from '@/lib/plan-vision';
import {
  calcLots,
  loadSizing,
  resolvePointValue,
  saveSizing,
  type LotResult,
  type SizingSettings,
} from '@/lib/sizing';
import { useThemedStyles } from '@/lib/styles';

type SizingView = {
  message?: string;
  result?: LotResult;
  source?: string;
};

type JournalSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  pair: string;
  direction: Direction;
  planned_entry: string;
  stop_loss: string;
  take_profit: string;
  size: string;
  reasons: string;
  feelings_before: string;
};

const initialForm: FormState = {
  pair: '',
  direction: 'buy',
  planned_entry: '',
  stop_loss: '',
  take_profit: '',
  size: '',
  reasons: '',
  feelings_before: '',
};

type Errors = Partial<Record<keyof FormState, string>>;

/** Blank is fine (returns null). Anything typed must be a number above 0. */
function toNumber(raw: string): number | null | 'bad' {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : 'bad';
}

export function gradeTone(grade: string | null): 'gain' | 'neutral' | 'loss' {
  if (grade === 'A+' || grade === 'A' || grade === 'B+') return 'gain';
  if (grade === 'B' || grade === 'C+') return 'neutral';
  return 'loss';
}

export function JournalSheet({ visible, onClose, onSaved }: JournalSheetProps) {
  const styles = useThemedStyles(sheet);

  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Errors>({});
  const [rulesText, setRulesText] = useState(DEFAULT_RULES.join('\n'));
  const [usual, setUsual] = useState<number | null>(null);
  const [grading, setGrading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ grade: GradeOutcome; flags: string[]; plan: PlanInput } | null>(null);

  const [readingShots, setReadingShots] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [riskText, setRiskText] = useState('');
  const [valueText, setValueText] = useState('');
  const [settings, setSettings] = useState<SizingSettings>({ riskAmount: null, pointValues: {} });
  const [sizing, setSizing] = useState<SizingView | null>(null);
  const [sizingBusy, setSizingBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setForm(initialForm);
      setErrors({});
      setError(null);
      setOutcome(null);
      setNote(null);
      setSizing(null);
      setValueText('');
      return;
    }
    loadRules().then((rules) => setRulesText(rules.join('\n')));
    usualLotSize()
      .then(setUsual)
      .catch(() => setUsual(null));
    loadSizing().then((saved) => {
      setSettings(saved);
      setRiskText(saved.riskAmount ? String(saved.riskAmount) : '');
    });
  }, [visible]);

  /** Pick one or several screenshots and fill the plan from them. */
  const fillFromScreenshots = async () => {
    setError(null);
    setNote(null);
    try {
      const picked = await pickScreenshots();
      if (picked.length === 0) {
        return;
      }
      setReadingShots(true);
      const found = await extractPlanFromImages(picked);
      const text = (value: number | null, fallback: string) =>
        value !== null ? String(value) : fallback;
      setForm((current) => ({
        ...current,
        pair: found.pair ?? current.pair,
        direction: found.direction ?? current.direction,
        planned_entry: text(found.entry_price, current.planned_entry),
        stop_loss: text(found.stop_loss, current.stop_loss),
        take_profit: text(found.take_profit, current.take_profit),
        size: text(found.size, current.size),
      }));
      setOutcome(null);
      setSizing(null);
      setNote(
        `Read ${picked.length} screenshot${picked.length === 1 ? '' : 's'}. ` +
          `${found.notes ? found.notes + ' ' : ''}Check every number before you go on. AI can misread a digit.`,
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not read those screenshots. Try again.');
    } finally {
      setReadingShots(false);
    }
  };

  /** Lot size for your fixed risk, from entry and stop loss. Plain arithmetic. */
  const calculateLots = async () => {
    setError(null);
    const risk = Number(riskText);
    const entry = toNumber(form.planned_entry);
    const stop = toNumber(form.stop_loss);
    const pair = form.pair.trim().toUpperCase();

    if (!(risk > 0)) {
      setSizing({ message: 'Enter how many dollars you risk on each trade.' });
      return;
    }
    if (!pair) {
      setSizing({ message: 'Enter the pair first.' });
      return;
    }
    if (entry === null || entry === 'bad' || stop === null || stop === 'bad') {
      setSizing({ message: 'Fill in the entry and the stop loss first.' });
      return;
    }
    const typed = valueText.trim() ? Number(valueText) : null;
    if (typed !== null && !(typed > 0)) {
      setSizing({ message: 'The value per lot must be a number above 0.' });
      return;
    }

    setSizingBusy(true);
    try {
      const next: SizingSettings = {
        riskAmount: risk,
        pointValues: typed ? { ...settings.pointValues, [pair]: typed } : settings.pointValues,
      };
      await saveSizing(next);
      setSettings(next);

      const resolved = await resolvePointValue(pair, next);
      if (!resolved) {
        setSizing({
          message:
            `I do not know what a 1.00 price move is worth per 1 lot on ${pair}, and you have fewer ` +
            'than 3 past trades on it. Type it in the box above. Find it in MetaTrader under the ' +
            "pair's contract specification, or from a past trade: profit divided by (price move x lots).",
        });
        return;
      }

      const result = calcLots({ risk, entry, stop, valuePerUnit: resolved.value });
      if (!result) {
        setSizing({ message: 'Entry and stop loss cannot be the same price.' });
        return;
      }
      setSizing({
        result,
        source:
          resolved.source === 'learned'
            ? `Value per lot learned from ${resolved.count} of your past ${pair} trades.`
            : `Using the value you saved for ${pair}.`,
      });
    } catch (err) {
      console.error(err);
      setSizing({ message: 'Could not calculate that. Try again.' });
    } finally {
      setSizingBusy(false);
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
    // Changing the plan after grading makes the grade stale.
    setOutcome(null);
  };

  const append = useCallback(
    (key: 'reasons' | 'feelings_before') => (text: string) =>
      setForm((current) => ({
        ...current,
        [key]: current[key].trim() ? `${current[key].trim()} ${text}` : text,
      })),
    [],
  );

  const handleGrade = async () => {
    const found: Errors = {};
    if (!form.pair.trim()) found.pair = 'Which pair?';
    if (!form.reasons.trim()) found.reasons = 'Say why you want this trade';

    const entry = toNumber(form.planned_entry);
    const stop = toNumber(form.stop_loss);
    const target = toNumber(form.take_profit);
    const size = toNumber(form.size);
    if (entry === 'bad') found.planned_entry = 'Numbers only';
    if (stop === 'bad') found.stop_loss = 'Numbers only';
    if (target === 'bad') found.take_profit = 'Numbers only';
    if (size === 'bad') found.size = 'Numbers only';

    setErrors(found);
    setError(null);
    if (Object.keys(found).length > 0) {
      return;
    }

    const plan: PlanInput = {
      pair: form.pair.trim().toUpperCase(),
      direction: form.direction,
      planned_entry: entry as number | null,
      stop_loss: stop as number | null,
      take_profit: target as number | null,
      size: size as number | null,
      reasons: form.reasons.trim(),
      feelings_before: form.feelings_before.trim(),
    };

    setGrading(true);
    try {
      const rules = parseRules(rulesText);
      const useRules = rules.length > 0 ? rules : DEFAULT_RULES;
      await saveRules(useRules);

      // If you have recorded a fixed risk and the pair's value per lot is known,
      // a lot size that would lose more than that is flagged.
      let riskCheck: { riskAmount: number; valuePerUnit: number } | undefined;
      const riskNumber = Number(riskText);
      if (riskNumber > 0) {
        const resolved = await resolvePointValue(plan.pair, await loadSizing());
        if (resolved) {
          riskCheck = { riskAmount: riskNumber, valuePerUnit: resolved.value };
        }
      }

      const flags = computeFlags(plan, usual, riskCheck);
      const grade = await gradePlan(plan, useRules, flags);
      setOutcome({ grade, flags, plan });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not grade the plan. Try again.');
    } finally {
      setGrading(false);
    }
  };

  const handleSave = async () => {
    if (!outcome) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await insertEntry(outcome.plan, {
        grade: outcome.grade.grade,
        results: outcome.grade.results,
        flags: outcome.flags,
        summary: outcome.grade.summary,
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? `Could not save the plan: ${err.message}`
          : 'Could not save the plan right now.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Plan a trade"
      subtitle="Say why before you click buy or sell. Graded against your own rules."
      footer={
        outcome ? (
          <View style={styles.footer}>
            <Button label="Save plan" size="lg" block loading={saving} onPress={handleSave} />
            <Button
              label="Edit the plan"
              variant="secondary"
              size="lg"
              block
              disabled={saving}
              onPress={() => setOutcome(null)}
            />
          </View>
        ) : (
          <Button label="Grade my setup" size="lg" block loading={grading} onPress={handleGrade} />
        )
      }
    >
      <View style={styles.form}>
        <Card style={styles.resultCard}>
          <ThemedText variant="bodyStrong">Fill it from screenshots</ThemedText>
          <ThemedText variant="caption" tone="textTertiary">
            Pick one or several: the chart with your lines, the positions tab, the history. The app
            reads the pair, direction, entry, stop loss, take profit and lots.
          </ThemedText>
          <Button
            label="Choose screenshots"
            variant="secondary"
            loading={readingShots}
            disabled={grading}
            onPress={fillFromScreenshots}
          />
          {note ? (
            <ThemedText variant="caption" tone="textSecondary">
              {note}
            </ThemedText>
          ) : null}
        </Card>

        <Field
          label="Pair"
          value={form.pair}
          onChangeText={(value) => set('pair', value)}
          placeholder="BTCUSD"
          autoCapitalize="characters"
          autoCorrect={false}
          error={errors.pair}
          editable={!grading}
        />

        <View style={styles.segmentRow}>
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
            label="Entry"
            value={form.planned_entry}
            onChangeText={(value) => set('planned_entry', value)}
            placeholder="0"
            keyboardType="decimal-pad"
            numeric
            error={errors.planned_entry}
            containerStyle={styles.flexOne}
          />
          <Field
            label="Stop loss"
            value={form.stop_loss}
            onChangeText={(value) => set('stop_loss', value)}
            placeholder="0"
            keyboardType="decimal-pad"
            numeric
            error={errors.stop_loss}
            containerStyle={styles.flexOne}
          />
        </View>

        <View style={styles.row}>
          <Field
            label="Take profit"
            value={form.take_profit}
            onChangeText={(value) => set('take_profit', value)}
            placeholder="0"
            keyboardType="decimal-pad"
            numeric
            error={errors.take_profit}
            containerStyle={styles.flexOne}
          />
          <Field
            label="Lot size"
            value={form.size}
            onChangeText={(value) => set('size', value)}
            placeholder="0.01"
            keyboardType="decimal-pad"
            numeric
            error={errors.size}
            hint={usual ? `Your usual: ${usual}` : undefined}
            containerStyle={styles.flexOne}
          />
        </View>

        <Card style={styles.resultCard}>
          <ThemedText variant="bodyStrong">Lot size for your fixed risk</ThemedText>
          <View style={styles.row}>
            <Field
              label="Risk per trade ($)"
              value={riskText}
              onChangeText={setRiskText}
              placeholder="10"
              keyboardType="decimal-pad"
              numeric
              hint="Saved for next time"
              containerStyle={styles.flexOne}
            />
            <Field
              label="$ per 1.00 move, 1 lot"
              value={valueText}
              onChangeText={setValueText}
              placeholder="auto"
              keyboardType="decimal-pad"
              numeric
              hint="Blank = learn from your trades"
              containerStyle={styles.flexOne}
            />
          </View>
          <Button
            label="Calculate lot size"
            variant="secondary"
            loading={sizingBusy}
            onPress={calculateLots}
          />
          {sizing?.message ? (
            <ThemedText variant="caption" tone="loss">
              {sizing.message}
            </ThemedText>
          ) : null}
          {sizing?.result ? (
            <View style={styles.resultCard}>
              {sizing.result.lots > 0 ? (
                <>
                  <ThemedText variant="monoXl" tone="gain">
                    {sizing.result.lots.toFixed(2)} lots
                  </ThemedText>
                  <ThemedText variant="body" tone="textSecondary">
                    Loses about ${sizing.result.riskAtLots.toFixed(2)} if your stop is hit. Rounded
                    down so it never goes above your ${riskText}.
                  </ThemedText>
                  <Button
                    label="Use this lot size"
                    onPress={() => set('size', sizing.result!.lots.toFixed(2))}
                  />
                </>
              ) : (
                <ThemedText variant="body" tone="loss">
                  Even 0.01 lots would lose about ${sizing.result.riskAtMinLot.toFixed(2)} at this
                  stop, which is more than your ${riskText}. Use a tighter stop or accept the
                  higher risk on purpose.
                </ThemedText>
              )}
              {sizing.source ? (
                <ThemedText variant="caption" tone="textTertiary">
                  {sizing.source} It is an estimate: check it against your broker.
                </ThemedText>
              ) : null}
            </View>
          ) : null}
        </Card>

        <VoiceQueueBanner onText={append('reasons')} />

        <Field
          label="Why are you taking this trade?"
          value={form.reasons}
          onChangeText={(value) => set('reasons', value)}
          placeholder="List every reason: trend, level, confirmation, where your stop is and why..."
          multiline
          inputStyle={styles.textArea}
          error={errors.reasons}
          editable={!grading}
        />
        <VoiceButton label="Speak your reasons" onText={append('reasons')} disabled={grading} />

        <Field
          label="How do you feel right now?"
          value={form.feelings_before}
          onChangeText={(value) => set('feelings_before', value)}
          placeholder="Calm, rushed, chasing a loss, confident, unsure..."
          multiline
          inputStyle={styles.textAreaSmall}
          editable={!grading}
        />
        <VoiceButton label="Speak how you feel" onText={append('feelings_before')} disabled={grading} />

        <Field
          label="Your rules (one per line)"
          value={rulesText}
          onChangeText={setRulesText}
          multiline
          inputStyle={styles.textArea}
          hint="The grade counts how many of these your reasons show. A+ means all of them."
          editable={!grading}
        />

        {error ? (
          <View style={styles.errorBanner}>
            <ThemedText variant="label" tone="loss">
              {error}
            </ThemedText>
          </View>
        ) : null}

        {outcome ? (
          <View>
            <SectionHeader title="Your grade" />
            <Card style={styles.resultCard}>
              <View style={styles.gradeRow}>
                <ThemedText variant="monoXl" tone={(gradeTone(outcome.grade.grade) === 'neutral' ? 'textSecondary' : gradeTone(outcome.grade.grade)) as 'gain' | 'loss' | 'textSecondary'}>
                  {outcome.grade.grade}
                </ThemedText>
                <ThemedText variant="caption" tone="textTertiary">
                  {outcome.grade.results.filter((r) => r.met).length} of{' '}
                  {outcome.grade.results.length} rules shown
                </ThemedText>
              </View>

              {outcome.flags.map((flag) => (
                <View key={flag} style={styles.flagRow}>
                  <Pill label="Warning" tone="loss" solid caps />
                  <ThemedText variant="body" tone="loss" style={styles.flexOne}>
                    {flag}
                  </ThemedText>
                </View>
              ))}
              {outcome.flags.length > 0 ? (
                <ThemedText variant="caption" tone="textTertiary">
                  A warning caps the grade at C+, however good the reasons sound.
                </ThemedText>
              ) : null}

              {outcome.grade.results.map((result) => (
                <View key={result.rule} style={styles.ruleRow}>
                  <ThemedText variant="bodyStrong" tone={result.met ? 'gain' : 'loss'}>
                    {result.met ? '✓' : '✗'}
                  </ThemedText>
                  <View style={styles.flexOne}>
                    <ThemedText variant="body">{result.rule}</ThemedText>
                    <ThemedText variant="caption" tone="textTertiary">
                      {result.evidence}
                    </ThemedText>
                  </View>
                </View>
              ))}

              {outcome.grade.summary ? (
                <ThemedText variant="body" tone="textSecondary">
                  {outcome.grade.summary}
                </ThemedText>
              ) : null}
            </Card>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    form: {
      gap: t.space.three,
    },
    footer: {
      gap: t.space.two,
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
    pressed: {
      opacity: 0.75,
    },
    textArea: {
      height: 120,
      paddingTop: t.space.two,
      textAlignVertical: 'top',
    },
    textAreaSmall: {
      height: 76,
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
    resultCard: {
      gap: t.space.three,
    },
    gradeRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: t.space.two,
    },
    flagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.two,
    },
    ruleRow: {
      flexDirection: 'row',
      gap: t.space.two,
    },
  });
