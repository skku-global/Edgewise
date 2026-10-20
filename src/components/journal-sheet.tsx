/**
 * Unified Trade Journal Sheet (Before -> During -> After).
 *
 * One entry per trade, moving through:
 *   - Before: Plan it, check rules, arithmetic warnings, entry chart screenshot.
 *   - During: Timestamped notes & feelings, optional screenshots, optional "Ask coach".
 *   - After: Exit price, result P/L, exit screenshot, lesson, review, close_entry RPC.
 *
 * Enforces rule: Manual trades require at least 2 screenshots (entry & exit) to close, max 5.
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import { VoiceButton } from '@/components/voice-button';
import type { Theme } from '@/constants/theme';
import {
  closeEntryViaRpc,
  coachCheckin,
  computeFlags,
  DEFAULT_RULES,
  gradePlan,
  insertEntry,
  loadRules,
  updateEntry,
  usualLotSize,
  type Checkin,
  type Direction,
  type GradeOutcome,
  type JournalEntry,
  type PlanInput,
} from '@/lib/journal';
import { extractPlanFromImages } from '@/lib/plan-vision';
import {
  deleteShot,
  listShots,
  pickShotImage,
  uploadShot,
  type EntryShot,
  type ShotPhase,
} from '@/lib/shots';
import { useThemedStyles } from '@/lib/styles';

export type JournalSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
  initialEntry?: JournalEntry | null;
  initialPhase?: 'before' | 'during' | 'after';
};

export type PhaseTab = 'before' | 'during' | 'after';

export function gradeTone(grade: string | null): 'gain' | 'neutral' | 'loss' {
  if (grade === 'A+' || grade === 'A' || grade === 'B+') return 'gain';
  if (grade === 'B' || grade === 'C+') return 'neutral';
  return 'loss';
}

function SelectablePill({
  label,
  selected,
  tone = 'neutral',
  onPress,
}: {
  label: string;
  selected: boolean;
  tone?: 'gain' | 'loss' | 'accent' | 'neutral';
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <Pill label={label} solid={selected} tone={tone} />
    </Pressable>
  );
}

const MOODS = ['calm', 'anxious', 'confident', 'frustrated', 'impatient'] as const;

export function JournalSheet({
  visible,
  onClose,
  onSaved,
  initialEntry = null,
  initialPhase = 'before',
}: JournalSheetProps) {
  const styles = useThemedStyles(sheet);

  // Active entry
  const [entry, setEntry] = useState<JournalEntry | null>(initialEntry);
  const [phase, setPhase] = useState<PhaseTab>(initialPhase);

  // Before fields
  const [pair, setPair] = useState('');
  const [direction, setDirection] = useState<Direction>('buy');
  const [plannedEntry, setPlannedEntry] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [size, setSize] = useState('');
  const [reasons, setReasons] = useState('');
  const [feelingsBefore, setFeelingsBefore] = useState('');

  // Before checks & rules
  const [rules, setRules] = useState<string[]>(DEFAULT_RULES);
  const [usualLots, setUsualLots] = useState<number | null>(null);
  const [gradeResult, setGradeResult] = useState<GradeOutcome | null>(null);
  const [checkingPlan, setCheckingPlan] = useState(false);

  // During fields
  const [checkinText, setCheckinText] = useState('');
  const [checkinMood, setCheckinMood] = useState<string>('calm');
  const [askingCoachId, setAskingCoachId] = useState<number | null>(null);

  // After fields
  const [exitPrice, setExitPrice] = useState('');
  const [resultPl, setResultPl] = useState('');
  const [lesson, setLesson] = useState('');
  const [thoughts, setThoughts] = useState('');
  const [emotionAfter, setEmotionAfter] = useState<string>('calm');

  // Screenshots
  const [shots, setShots] = useState<EntryShot[]>([]);
  const [uploadingShot, setUploadingShot] = useState(false);

  // Status & errors
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Sync state when initialEntry or visible changes
  useEffect(() => {
    if (!visible) return;
    setEntry(initialEntry);
    setPhase(
      initialEntry?.status === 'closed'
        ? 'after'
        : initialEntry?.status === 'open'
          ? 'during'
          : initialPhase
    );

    if (initialEntry) {
      setPair(initialEntry.pair ?? '');
      setDirection(initialEntry.direction ?? 'buy');
      setPlannedEntry(initialEntry.planned_entry ? String(initialEntry.planned_entry) : '');
      setStopLoss(initialEntry.stop_loss ? String(initialEntry.stop_loss) : '');
      setTakeProfit(initialEntry.take_profit ? String(initialEntry.take_profit) : '');
      setSize(initialEntry.size ? String(initialEntry.size) : '');
      setReasons(initialEntry.reasons ?? '');
      setFeelingsBefore(initialEntry.feelings_before ?? '');
      setExitPrice(initialEntry.exit_price ? String(initialEntry.exit_price) : '');
      setResultPl(initialEntry.result_pl !== null && initialEntry.result_pl !== undefined ? String(initialEntry.result_pl) : '');
      setLesson(initialEntry.lesson ?? '');
      setThoughts(initialEntry.thoughts ?? '');
      setEmotionAfter(initialEntry.emotion_after ?? 'calm');
    } else {
      setPair('');
      setDirection('buy');
      setPlannedEntry('');
      setStopLoss('');
      setTakeProfit('');
      setSize('');
      setReasons('');
      setFeelingsBefore('');
      setExitPrice('');
      setResultPl('');
      setLesson('');
      setThoughts('');
      setEmotionAfter('calm');
      setGradeResult(null);
    }

    loadRules().then(setRules).catch(console.error);
    usualLotSize().then(setUsualLots).catch(console.error);
  }, [visible, initialEntry, initialPhase]);

  // Load screenshots for active entry
  const reloadShots = useCallback(async (entryId?: number | null) => {
    const id = entryId ?? entry?.id;
    if (!id) {
      setShots([]);
      return;
    }
    setLoadingShots(true);
    try {
      const list = await listShots({ entryId: id });
      setShots(list);
    } catch (err) {
      console.error('Error loading shots:', err);
    } finally {
      setLoadingShots(false);
    }
  }, [entry?.id]);

  useEffect(() => {
    if (visible && entry?.id) {
      reloadShots(entry.id);
    }
  }, [visible, entry?.id, reloadShots]);

  // Compute live arithmetic warnings
  const currentPlanInput: PlanInput = useMemo(
    () => ({
      pair: pair.trim(),
      direction,
      planned_entry: plannedEntry.trim() ? Number(plannedEntry) : null,
      stop_loss: stopLoss.trim() ? Number(stopLoss) : null,
      take_profit: takeProfit.trim() ? Number(takeProfit) : null,
      size: size.trim() ? Number(size) : null,
      reasons: reasons.trim(),
      feelings_before: feelingsBefore.trim(),
    }),
    [pair, direction, plannedEntry, stopLoss, takeProfit, size, reasons, feelingsBefore]
  );

  const arithmeticFlags = useMemo(
    () => computeFlags(currentPlanInput, usualLots),
    [currentPlanInput, usualLots]
  );

  /* ------------------------------------------------------------------ */
  /* Actions: Screenshots                                               */
  /* ------------------------------------------------------------------ */

  const handleAddScreenshot = async (shotPhase: ShotPhase) => {
    setError(null);
    setStatusMessage(null);
    try {
      const picked = await pickShotImage();
      if (!picked) return;

      if (shots.length >= 5) {
        setError('Maximum of 5 screenshots allowed per trade.');
        return;
      }

      setUploadingShot(true);
      let activeEntryId = entry?.id;

      // If we don't have an entry yet in 'before' phase, auto-create a draft entry first
      if (!activeEntryId) {
        const draft = await insertEntry(
          {
            pair: pair.trim() || 'DRAFT',
            direction,
            planned_entry: plannedEntry ? Number(plannedEntry) : null,
            stop_loss: stopLoss ? Number(stopLoss) : null,
            take_profit: takeProfit ? Number(takeProfit) : null,
            size: size ? Number(size) : null,
            reasons: reasons.trim(),
            feelings_before: feelingsBefore.trim(),
          },
          { grade: 'Draft', results: [], flags: [], summary: '' }
        );
        activeEntryId = draft.id;
        setEntry(draft);
      }

      const uploaded = await uploadShot({
        uri: picked.uri,
        phase: shotPhase,
        entryId: activeEntryId,
      });

      setShots((prev) => [...prev, uploaded]);

      // Read numbers from screenshot and MERGE into empty fields only (never overwrite)
      setStatusMessage('Analyzing screenshot for trade details…');
      try {
        const extracted = await extractPlanFromImages([
          { uri: picked.uri, mime: 'image/jpeg', name: picked.name },
        ]);

        if (extracted) {
          if (!pair.trim() && extracted.pair) setPair(extracted.pair);
          if (extracted.direction && (!direction || direction === 'buy')) setDirection(extracted.direction);
          if (!plannedEntry.trim() && extracted.entry_price !== null) setPlannedEntry(String(extracted.entry_price));
          if (!stopLoss.trim() && extracted.stop_loss !== null) setStopLoss(String(extracted.stop_loss));
          if (!takeProfit.trim() && extracted.take_profit !== null) setTakeProfit(String(extracted.take_profit));
          if (!size.trim() && extracted.size !== null) setSize(String(extracted.size));
          if (shotPhase === 'after' && !exitPrice.trim() && extracted.entry_price !== null) {
            setExitPrice(String(extracted.entry_price));
          }
          setStatusMessage('Trade numbers read from screenshot and merged into empty fields.');
        }
      } catch (aiErr) {
        console.warn('AI read failed, image saved:', aiErr);
        setStatusMessage('Screenshot attached.');
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not upload screenshot.');
    } finally {
      setUploadingShot(false);
    }
  };

  const handleDeleteScreenshot = async (shot: EntryShot) => {
    try {
      await deleteShot(shot.id, shot.path);
      setShots((prev) => prev.filter((s) => s.id !== shot.id));
    } catch (err) {
      console.error(err);
      setError('Could not delete screenshot.');
    }
  };

  /* ------------------------------------------------------------------ */
  /* Actions: Phase 1 (Before)                                          */
  /* ------------------------------------------------------------------ */

  const handleGradePlan = async () => {
    if (!pair.trim()) {
      setError('Enter a currency pair (e.g. EURUSD).');
      return;
    }
    setCheckingPlan(true);
    setError(null);
    try {
      const outcome = await gradePlan(currentPlanInput, rules, arithmeticFlags);
      setGradeResult(outcome);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to grade plan.');
    } finally {
      setCheckingPlan(false);
    }
  };

  const handleSavePlan = async () => {
    if (!pair.trim()) {
      setError('Enter a pair (e.g. EURUSD) before saving.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (entry) {
        const updated = await updateEntry(entry.id, {
          pair: pair.trim().toUpperCase(),
          direction,
          planned_entry: plannedEntry.trim() ? Number(plannedEntry) : null,
          stop_loss: stopLoss.trim() ? Number(stopLoss) : null,
          take_profit: takeProfit.trim() ? Number(takeProfit) : null,
          size: size.trim() ? Number(size) : null,
          reasons: reasons.trim(),
          feelings_before: feelingsBefore.trim(),
          grade: gradeResult?.grade ?? entry.grade,
          rules_result: gradeResult?.results ?? entry.rules_result,
          flags: arithmeticFlags,
          ai_summary: gradeResult?.summary ?? entry.ai_summary,
        });
        setEntry(updated);
      } else {
        const created = await insertEntry(
          currentPlanInput,
          gradeResult
            ? { ...gradeResult, flags: arithmeticFlags }
            : { grade: 'D', results: [], flags: arithmeticFlags, summary: '' }
        );
        setEntry(created);
      }
      setStatusMessage('Plan saved. You can track check-ins during the trade or log the exit.');
      onSaved?.();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not save plan.');
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Actions: Phase 2 (During)                                          */
  /* ------------------------------------------------------------------ */

  const handleAddCheckin = async () => {
    const text = checkinText.trim();
    if (!text) {
      setError('Enter how you feel or how the trade is going.');
      return;
    }
    if (!entry) {
      setError('Please save the initial plan in the "Before" tab first.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const newCheckin: Checkin = {
        at: new Date().toISOString(),
        text,
        mood: checkinMood,
      };

      const updatedCheckins = [...entry.checkins, newCheckin];
      const updated = await updateEntry(entry.id, {
        checkins: updatedCheckins,
        status: entry.status === 'planned' ? 'open' : entry.status,
      });

      setEntry(updated);
      setCheckinText('');
      setStatusMessage('Note logged. (No AI called)');
      onSaved?.();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to save check-in note.');
    } finally {
      setBusy(false);
    }
  };

  const handleAskCoach = async (index: number, checkinItem: Checkin) => {
    if (!entry) return;
    setAskingCoachId(index);
    setError(null);
    try {
      const reply = await coachCheckin(entry, checkinItem.text);
      const updatedCheckins = [...entry.checkins];
      updatedCheckins[index] = { ...checkinItem, reply };

      const updated = await updateEntry(entry.id, { checkins: updatedCheckins });
      setEntry(updated);
      onSaved?.();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Coach consultation failed.');
    } finally {
      setAskingCoachId(null);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Actions: Phase 3 (After)                                           */
  /* ------------------------------------------------------------------ */

  const handleCloseTrade = async () => {
    if (!entry) {
      setError('No active entry to close.');
      return;
    }
    if (shots.length < 2) {
      setError(`Cannot close: 2 screenshots required (entry & exit). You have ${shots.length}.`);
      return;
    }

    const exitNum = Number(exitPrice.trim());
    if (!exitPrice.trim() || !Number.isFinite(exitNum)) {
      setError('Enter a valid exit price.');
      return;
    }

    const plNum = Number(resultPl.trim());
    if (!resultPl.trim() || !Number.isFinite(plNum)) {
      setError('Enter a valid result profit/loss amount (e.g. 25.50 or -15.00).');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const tradeId = await closeEntryViaRpc({
        entryId: entry.id,
        exitPrice: exitNum,
        resultPl: plNum,
        lesson: lesson.trim() || undefined,
        thoughts: thoughts.trim() || undefined,
        emotionAfter: emotionAfter || undefined,
        moods: [feelingsBefore, checkinMood, emotionAfter].filter(Boolean),
      });

      setStatusMessage(`Trade successfully closed and recorded (Trade #${tradeId})!`);
      onSaved?.();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to close trade.');
    } finally {
      setBusy(false);
    }
  };

  const canClose = shots.length >= 2;
  const isClosed = entry?.status === 'closed';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={isClosed ? 'Trade Review (Closed)' : entry ? `Trade: ${entry.pair} (${entry.status})` : 'New Trade Journal'}
    >
      <ScrollView contentContainerStyle={styles.container}>
        {/* Phase selector tabs */}
        <View style={styles.phaseTabs}>
          {(['before', 'during', 'after'] as PhaseTab[]).map((p) => {
            const active = phase === p;
            const label = p === 'before' ? '1. Before (Plan)' : p === 'during' ? '2. During (Live)' : '3. After (Close)';
            return (
              <Pressable
                key={p}
                accessibilityRole="button"
                onPress={() => setPhase(p)}
                style={[styles.phaseTab, active && styles.phaseTabActive]}
              >
                <ThemedText
                  variant="label"
                  tone={active ? 'accentText' : 'textSecondary'}
                  style={styles.phaseTabText}
                >
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {/* Global status / alerts */}
        {statusMessage ? (
          <View style={styles.statusBox}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#0B5A37" />
            <ThemedText variant="caption" tone="gain" style={{ flex: 1 }}>
              {statusMessage}
            </ThemedText>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color="#B3322A" />
            <ThemedText variant="caption" tone="loss" style={{ flex: 1 }}>
              {error}
            </ThemedText>
          </View>
        ) : null}

        {/* ========================================================== */}
        {/* PHASE 1: BEFORE                                            */}
        {/* ========================================================== */}
        {phase === 'before' && (
          <View style={styles.section}>
            <Card style={styles.card}>
              <SectionHeader
                title="Trade Parameters"
                subtitle="Speak, type, or attach a chart screenshot. New data fills empty fields without overwriting."
              />

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Pair / Symbol"
                    value={pair}
                    onChangeText={setPair}
                    placeholder="e.g. EURUSD, XAUUSD"
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.dirPills}>
                  <ThemedText variant="caption" tone="textSecondary" style={{ marginBottom: 4 }}>
                    Direction
                  </ThemedText>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <SelectablePill
                      label="BUY / LONG"
                      selected={direction === 'buy'}
                      tone="gain"
                      onPress={() => setDirection('buy')}
                    />
                    <SelectablePill
                      label="SELL / SHORT"
                      selected={direction === 'sell'}
                      tone="loss"
                      onPress={() => setDirection('sell')}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Planned Entry"
                    value={plannedEntry}
                    onChangeText={setPlannedEntry}
                    placeholder="e.g. 1.0850"
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Stop Loss (S/L)"
                    value={stopLoss}
                    onChangeText={setStopLoss}
                    placeholder="e.g. 1.0820"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Take Profit (T/P)"
                    value={takeProfit}
                    onChangeText={setTakeProfit}
                    placeholder="e.g. 1.0920"
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Lot Size"
                    value={size}
                    onChangeText={setSize}
                    placeholder="e.g. 0.10"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Reasons & Voice Input */}
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <ThemedText variant="caption" tone="textSecondary">
                    Reasons & Confluence
                  </ThemedText>
                  <VoiceButton
                    label="Speak reasons"
                    onText={(spoken) => setReasons((prev) => (prev ? `${prev} ${spoken}` : spoken))}
                  />
                </View>
                <Field
                  label=""
                  value={reasons}
                  onChangeText={setReasons}
                  placeholder="Why this trade? Confluence, higher timeframe trend, key support/resistance..."
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <ThemedText variant="caption" tone="textSecondary">
                    Feelings Before Entry
                  </ThemedText>
                  <VoiceButton
                    label="Speak feeling"
                    onText={(spoken) => setFeelingsBefore((prev) => (prev ? `${prev} ${spoken}` : spoken))}
                  />
                </View>
                <Field
                  label=""
                  value={feelingsBefore}
                  onChangeText={setFeelingsBefore}
                  placeholder="How do you feel right now? (Calm, confident, FOMO, hurried...)"
                />
              </View>

              {/* Arithmetic Warnings */}
              {arithmeticFlags.length > 0 ? (
                <View style={styles.warningBox}>
                  <ThemedText variant="caption" tone="loss" style={{ fontWeight: '700' }}>
                    Risk Warnings (Arithmetic):
                  </ThemedText>
                  {arithmeticFlags.map((flag, idx) => (
                    <ThemedText key={idx} variant="caption" tone="loss">
                      • {flag}
                    </ThemedText>
                  ))}
                </View>
              ) : null}

              {/* Screenshots section */}
              <View style={styles.shotHeaderRow}>
                <ThemedText variant="bodyStrong">
                  Entry Screenshot ({shots.filter((s) => s.phase === 'before').length} before, {shots.length}/5 total)
                </ThemedText>
                <Button
                  size="sm"
                  variant="secondary"
                  label={uploadingShot ? 'Analyzing…' : 'Add chart screenshot'}
                  loading={uploadingShot}
                  onPress={() => handleAddScreenshot('before')}
                />
              </View>

              {/* Thumbnails */}
              <View style={styles.thumbGrid}>
                {shots.map((shot) => (
                  <View key={shot.id} style={styles.thumbWrapper}>
                    {shot.signed_url ? (
                      <Image source={{ uri: shot.signed_url }} style={styles.thumbImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.thumbImage, styles.thumbPlaceholder]}>
                        <Ionicons name="image-outline" size={24} color="#8A948F" />
                      </View>
                    )}
                    <Pressable
                      style={styles.deleteThumbBtn}
                      onPress={() => handleDeleteScreenshot(shot)}
                      accessibilityLabel="Delete screenshot"
                    >
                      <Ionicons name="close" size={14} color="#FFFFFF" />
                    </Pressable>
                    <ThemedText variant="caption" tone="textTertiary" style={{ textAlign: 'center', marginTop: 2 }}>
                      {shot.phase}
                    </ThemedText>
                  </View>
                ))}
              </View>

              {/* Rules check button & results */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <Button
                  variant="secondary"
                  label={checkingPlan ? 'Checking…' : 'Grade vs Rules'}
                  loading={checkingPlan}
                  onPress={handleGradePlan}
                />
                <Button
                  label={busy ? 'Saving…' : entry ? 'Update Plan' : 'Save Plan'}
                  loading={busy}
                  onPress={handleSavePlan}
                />
              </View>

              {gradeResult ? (
                <View style={styles.gradeBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pill label={`Grade ${gradeResult.grade}`} solid tone={gradeTone(gradeResult.grade)} />
                    <ThemedText variant="bodyStrong">{gradeResult.summary}</ThemedText>
                  </View>
                  <View style={{ marginTop: 8, gap: 4 }}>
                    {gradeResult.results.map((r, i) => (
                      <ThemedText key={i} variant="caption" tone={r.met ? 'gain' : 'loss'}>
                        {r.met ? '✓' : '✗'} {r.rule}: {r.evidence}
                      </ThemedText>
                    ))}
                  </View>
                </View>
              ) : null}
            </Card>
          </View>
        )}

        {/* ========================================================== */}
        {/* PHASE 2: DURING                                            */}
        {/* ========================================================== */}
        {phase === 'during' && (
          <View style={styles.section}>
            <Card style={styles.card}>
              <SectionHeader
                title="Trade In Progress"
                subtitle="Log timestamped check-in notes and emotions without calling AI. Click 'Ask coach' whenever you want advice."
              />

              {entry ? (
                <View style={styles.tradeSnapshot}>
                  <ThemedText variant="bodyStrong">
                    {entry.pair} • {entry.direction.toUpperCase()} • Entry: {entry.planned_entry ?? '—'} • Stop: {entry.stop_loss ?? '—'} • Target: {entry.take_profit ?? '—'}
                  </ThemedText>
                </View>
              ) : (
                <ThemedText variant="caption" tone="loss">
                  No plan saved yet. Go to Before tab and save the trade plan first.
                </ThemedText>
              )}

              {/* Check-ins list */}
              <View style={{ marginTop: 12, gap: 10 }}>
                {entry?.checkins.map((chk, index) => (
                  <View key={index} style={styles.checkinCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <ThemedText variant="caption" tone="textTertiary">
                        {new Date(chk.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </ThemedText>
                      {chk.mood ? <Pill label={chk.mood} tone="neutral" /> : null}
                    </View>
                    <ThemedText variant="body" style={{ marginTop: 4 }}>
                      {chk.text}
                    </ThemedText>

                    {chk.reply ? (
                      <View style={styles.coachReply}>
                        <ThemedText variant="caption" tone="accentText" style={{ fontWeight: '700' }}>
                          Coach:
                        </ThemedText>
                        <ThemedText variant="caption" tone="text">
                          {chk.reply}
                        </ThemedText>
                      </View>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        label={askingCoachId === index ? 'Consulting Coach…' : 'Ask coach'}
                        loading={askingCoachId === index}
                        onPress={() => handleAskCoach(index, chk)}
                        style={{ alignSelf: 'flex-start', marginTop: 6 }}
                      />
                    )}
                  </View>
                ))}
              </View>

              {/* New note input */}
              <View style={{ marginTop: 16 }}>
                <ThemedText variant="caption" tone="textSecondary" style={{ marginBottom: 4 }}>
                  Current Mood:
                </ThemedText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {MOODS.map((m) => (
                    <SelectablePill
                      key={m}
                      label={m}
                      selected={checkinMood === m}
                      tone="neutral"
                      onPress={() => setCheckinMood(m)}
                    />
                  ))}
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <ThemedText variant="caption" tone="textSecondary">
                    Check-in Note
                  </ThemedText>
                  <VoiceButton
                    label="Speak note"
                    onText={(spoken) => setCheckinText((prev) => (prev ? `${prev} ${spoken}` : spoken))}
                  />
                </View>
                <Field
                  label=""
                  value={checkinText}
                  onChangeText={setCheckinText}
                  placeholder="How is the trade going? Are you feeling nervous, tempted to move stop..."
                  multiline
                  numberOfLines={2}
                />

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Button
                    variant="primary"
                    label={busy ? 'Saving…' : 'Save Note (No AI)'}
                    loading={busy}
                    onPress={handleAddCheckin}
                  />
                  <Button
                    variant="secondary"
                    label={uploadingShot ? 'Uploading…' : 'Add During Screenshot'}
                    loading={uploadingShot}
                    onPress={() => handleAddScreenshot('during')}
                  />
                </View>
              </View>
            </Card>
          </View>
        )}

        {/* ========================================================== */}
        {/* PHASE 3: AFTER (Close & Review)                            */}
        {/* ========================================================== */}
        {phase === 'after' && (
          <View style={styles.section}>
            <Card style={styles.card}>
              <SectionHeader
                title="Trade Close & Review"
                subtitle="2 screenshots required (entry & exit) to close a manual trade. Read exit from screenshot, voice, or type."
              />

              {/* Requirement reminder */}
              <View style={[styles.requirementBox, canClose ? styles.reqMet : styles.reqMissing]}>
                <Ionicons
                  name={canClose ? 'checkmark-circle' : 'information-circle'}
                  size={20}
                  color={canClose ? '#0F7A4B' : '#B3322A'}
                />
                <ThemedText variant="caption" tone={canClose ? 'gain' : 'loss'} style={{ flex: 1, fontWeight: '600' }}>
                  Screenshots: {shots.length} of 5 attached {canClose ? '(Requirement met)' : '(Need at least 2 to close)'}
                </ThemedText>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Exit Price *"
                    value={exitPrice}
                    onChangeText={setExitPrice}
                    placeholder="e.g. 1.0910"
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Result P/L ($) *"
                    value={resultPl}
                    onChangeText={setResultPl}
                    placeholder="e.g. 60 or -25"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <ThemedText variant="caption" tone="textSecondary">
                    Lesson Learned
                  </ThemedText>
                  <VoiceButton
                    label="Speak lesson"
                    onText={(spoken) => setLesson((prev) => (prev ? `${prev} ${spoken}` : spoken))}
                  />
                </View>
                <Field
                  label=""
                  value={lesson}
                  onChangeText={setLesson}
                  placeholder="What did this trade teach you about your setup or psychology?"
                  multiline
                  numberOfLines={2}
                />
              </View>

              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <ThemedText variant="caption" tone="textSecondary">
                    Closing Thoughts
                  </ThemedText>
                  <VoiceButton
                    label="Speak thoughts"
                    onText={(spoken) => setThoughts((prev) => (prev ? `${prev} ${spoken}` : spoken))}
                  />
                </View>
                <Field
                  label=""
                  value={thoughts}
                  onChangeText={setThoughts}
                  placeholder="Any extra observations or notes on market behavior..."
                  multiline
                  numberOfLines={2}
                />
              </View>

              <View style={{ marginTop: 8 }}>
                <ThemedText variant="caption" tone="textSecondary" style={{ marginBottom: 4 }}>
                  Emotion After Trade:
                </ThemedText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {MOODS.map((m) => (
                    <SelectablePill
                      key={m}
                      label={m}
                      selected={emotionAfter === m}
                      tone="neutral"
                      onPress={() => setEmotionAfter(m)}
                    />
                  ))}
                </View>
              </View>

              {/* Exit screenshot button */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <Button
                  variant="secondary"
                  label={uploadingShot ? 'Analyzing…' : 'Add Exit Screenshot'}
                  loading={uploadingShot}
                  onPress={() => handleAddScreenshot('after')}
                />
              </View>

              {/* Screenshots gallery */}
              <View style={[styles.thumbGrid, { marginTop: 12 }]}>
                {shots.map((shot) => (
                  <View key={shot.id} style={styles.thumbWrapper}>
                    {shot.signed_url ? (
                      <Image source={{ uri: shot.signed_url }} style={styles.thumbImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.thumbImage, styles.thumbPlaceholder]}>
                        <Ionicons name="image-outline" size={24} color="#8A948F" />
                      </View>
                    )}
                    <Pressable
                      style={styles.deleteThumbBtn}
                      onPress={() => handleDeleteScreenshot(shot)}
                      accessibilityLabel="Delete screenshot"
                    >
                      <Ionicons name="close" size={14} color="#FFFFFF" />
                    </Pressable>
                    <ThemedText variant="caption" tone="textTertiary" style={{ textAlign: 'center', marginTop: 2 }}>
                      {shot.phase}
                    </ThemedText>
                  </View>
                ))}
              </View>

              {/* Close trade CTA */}
              <View style={{ marginTop: 20 }}>
                <Button
                  variant="primary"
                  disabled={!canClose || isClosed || busy}
                  loading={busy}
                  label={
                    isClosed
                      ? 'Trade is Closed (Locked)'
                      : canClose
                        ? 'Close Trade (Lock & Write to Trades)'
                        : `Need ${2 - shots.length} more screenshot(s) to close`
                  }
                  onPress={handleCloseTrade}
                />
              </View>
            </Card>
          </View>
        )}
      </ScrollView>
    </Sheet>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    container: {
      paddingBottom: 40,
      gap: t.space.three,
    },
    phaseTabs: {
      flexDirection: 'row',
      backgroundColor: t.color.bgSunken,
      borderRadius: t.radius.pill,
      padding: 4,
      marginBottom: t.space.two,
    },
    phaseTab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: t.radius.pill,
    },
    phaseTabActive: {
      backgroundColor: t.color.surface,
      ...(t.scheme === 'dark' ? t.elevation[1] : {}),
    },
    phaseTabText: {
      fontSize: 13,
      fontWeight: '600',
    },
    section: {
      gap: t.space.two,
    },
    card: {
      gap: t.space.two,
    },
    row: {
      flexDirection: 'row',
      gap: t.space.two,
      alignItems: 'flex-start',
    },
    dirPills: {
      justifyContent: 'center',
      paddingTop: 4,
    },
    shotHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 12,
    },
    thumbGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 8,
    },
    thumbWrapper: {
      position: 'relative',
      width: 70,
    },
    thumbImage: {
      width: 70,
      height: 70,
      borderRadius: t.radius.md,
      backgroundColor: t.color.bgSunken,
    },
    thumbPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: t.color.border,
    },
    deleteThumbBtn: {
      position: 'absolute',
      top: -4,
      right: -4,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: '#B3322A',
      alignItems: 'center',
      justifyContent: 'center',
    },
    gradeBox: {
      marginTop: 12,
      padding: t.space.three,
      borderRadius: t.radius.md,
      backgroundColor: t.color.bgSunken,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    warningBox: {
      marginTop: 8,
      padding: t.space.two,
      borderRadius: t.radius.sm,
      backgroundColor: t.color.lossSoft,
      borderWidth: 1,
      borderColor: t.color.loss,
      gap: 2,
    },
    statusBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.one,
      padding: t.space.two,
      backgroundColor: '#E0F2E8',
      borderRadius: t.radius.sm,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.one,
      padding: t.space.two,
      backgroundColor: t.color.lossSoft,
      borderRadius: t.radius.sm,
    },
    tradeSnapshot: {
      padding: t.space.two,
      backgroundColor: t.color.bgSunken,
      borderRadius: t.radius.sm,
      borderLeftWidth: 3,
      borderLeftColor: t.color.accent,
    },
    checkinCard: {
      padding: t.space.two,
      backgroundColor: t.color.bgSunken,
      borderRadius: t.radius.sm,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    coachReply: {
      marginTop: 6,
      padding: t.space.one,
      backgroundColor: t.color.surface,
      borderRadius: t.radius.sm,
      borderLeftWidth: 2,
      borderLeftColor: t.color.accent,
    },
    requirementBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.one,
      padding: t.space.two,
      borderRadius: t.radius.sm,
      borderWidth: 1,
      marginBottom: 6,
    },
    reqMet: {
      backgroundColor: '#E0F2E8',
      borderColor: '#0F7A4B',
    },
    reqMissing: {
      backgroundColor: t.color.lossSoft,
      borderColor: '#B3322A',
    },
  });
