/**
 * Full-screen detail view for a single trade, opened from the trades table and
 * from a calendar day.
 *
 * Stage 3:
 * - Shows Before, During, After in order
 * - Moods timeline across trade lifecycle
 * - Screenshots with count (n of 5, 2 minimum enforced/highlighted)
 * - Synced trades without an entry show screenshots and mood sections with an Add button
 * - Post-close editable fields (mood, screenshots up to 5, lesson, thoughts, emotion_after) can be saved
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import type { Theme } from '@/constants/theme';
import { formatFullDate, formatPrice, formatSigned } from '@/lib/format';
import { updateEntry } from '@/lib/journal';
import { displaySetup } from '@/lib/setup-types';
import { listShots, pickAndUploadShot, type EntryShot } from '@/lib/shots';
import { useThemedStyles } from '@/lib/styles';
import { supabase } from '@/lib/supabase';
import { tradeCosts } from '@/lib/trade-math';
import type { TradeRow } from '@/lib/trade-table';
import { isImported } from '@/lib/untagged';

type TradeDetailSheetProps = {
  trade: TradeRow | null;
  onClose: () => void;
  onUpdated?: () => void;
};

const MOOD_OPTIONS = ['calm', 'anxious', 'confident', 'frustrated', 'impatient'] as const;

function motionLabel(flag: string | null): string {
  if (flag === 'restless') return 'Restless — you were moving while logging this';
  if (flag === 'steady') return 'Steady — you were still while logging this';
  return 'Not recorded (no accelerometer on web)';
}

function sourceLabel(source: string): string {
  if (source === 'mt5') return 'MetaTrader 5';
  if (source === 'mt4') return 'MetaTrader 4';
  if (source === 'ctrader') return 'cTrader';
  if (source === 'tradelocker') return 'TradeLocker';
  return source;
}

function holdTime(openedAt: string, closedAt: string): string | null {
  const ms = Date.parse(closedAt) - Date.parse(openedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;

  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}

function gradeTone(grade: string | null): 'gain' | 'neutral' | 'loss' {
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

export function TradeDetailSheet({ trade, onClose, onUpdated }: TradeDetailSheetProps) {
  const styles = useThemedStyles(sheet);

  const entry = trade?.journal_entry ?? null;

  // Local state for editable post-close fields
  const [lesson, setLesson] = useState('');
  const [thoughts, setThoughts] = useState('');
  const [emotionAfter, setEmotionAfter] = useState<string | null>(null);
  const [savingReview, setSavingReview] = useState(false);

  // Screenshots state
  const [shots, setShots] = useState<EntryShot[]>([]);
  const [loadingShots, setLoadingShots] = useState(false);
  const [uploadingShot, setUploadingShot] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Moods state for synced trades or manual additions
  const [tradeMoods, setTradeMoods] = useState<string[]>([]);
  const [addingMood, setAddingMood] = useState(false);

  // Sync state whenever trade changes
  useEffect(() => {
    if (!trade) {
      setShots([]);
      setTradeMoods([]);
      return;
    }

    setLesson(entry?.lesson ?? '');
    setThoughts(entry?.thoughts ?? '');
    setEmotionAfter(entry?.emotion_after ?? null);
    setTradeMoods(trade.moods ?? []);

    // Load shots with fresh signed URLs
    setLoadingShots(true);
    listShots({ tradeId: trade.id, entryId: entry?.id })
      .then((loaded) => setShots(loaded))
      .catch((err) => console.error('Failed to load shots:', err))
      .finally(() => setLoadingShots(false));
  }, [trade?.id, entry?.id]);

  const handleSaveReview = async () => {
    if (!entry) return;
    setSavingReview(true);
    try {
      await updateEntry(entry.id, {
        lesson: lesson.trim() || null,
        thoughts: thoughts.trim() || null,
        emotion_after: emotionAfter,
      });
      Alert.alert('Saved', 'Post-trade review updated successfully.');
      onUpdated?.();
    } catch (err: unknown) {
      console.error(err);
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save review changes.');
    } finally {
      setSavingReview(false);
    }
  };

  const handleAddShot = async () => {
    if (!trade) return;
    if (shots.length >= 5) {
      Alert.alert('Limit reached', 'Maximum 5 screenshots allowed per trade.');
      return;
    }

    setUploadingShot(true);
    try {
      const shot = await pickAndUploadShot({
        phase: 'after',
        tradeId: trade.id,
        entryId: entry?.id,
      });
      if (shot) {
        setShots((prev) => [...prev, shot]);
        onUpdated?.();
      }
    } catch (err: unknown) {
      console.error(err);
      Alert.alert('Upload Failed', err instanceof Error ? err.message : 'Could not upload screenshot.');
    } finally {
      setUploadingShot(false);
    }
  };

  const handleAddMoodToTrade = async (moodTag: string) => {
    if (!trade) return;
    setAddingMood(true);
    try {
      const { error } = await supabase.from('moods').insert([
        {
          trade_id: trade.id,
          mood_tag: moodTag,
        },
      ]);
      if (error) throw error;
      setTradeMoods((prev) => [...prev, moodTag]);
      onUpdated?.();
    } catch (err: unknown) {
      console.error(err);
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not add mood.');
    } finally {
      setAddingMood(false);
    }
  };

  const held =
    trade?.opened_at && trade?.closed_at ? holdTime(trade.opened_at, trade.closed_at) : null;
  const costs = trade ? tradeCosts(trade) : null;

  return (
    <>
      <Sheet
        visible={trade !== null}
        onClose={onClose}
        title={trade ? trade.pair.toUpperCase() : ''}
        subtitle={trade ? formatFullDate(trade.created_at) : undefined}
      >
        {trade ? (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* The number the user opened this sheet for, on the hero colour so it
                reads as the headline rather than the first of cards. */}
            <View style={styles.plCard}>
              <ThemedText variant="overline" tone="heroMuted">
                PROFIT / LOSS
              </ThemedText>
              <ThemedText variant="monoXl" tone={trade.pl >= 0 ? 'gain' : 'loss'}>
                {formatSigned(trade.pl)}
              </ThemedText>
              <View style={styles.plMeta}>
                <Pill
                  label={trade.direction}
                  tone={trade.direction === 'buy' ? 'gain' : 'loss'}
                  solid
                  caps
                />
                {isImported(trade) ? (
                  <Pill label={sourceLabel(trade.source)} tone="accent" />
                ) : (
                  <Pill label={entry ? 'Journaled' : 'Manual'} tone="neutral" />
                )}
                {entry?.grade ? (
                  <Pill label={`Grade ${entry.grade}`} tone={gradeTone(entry.grade)} solid />
                ) : null}
              </View>
            </View>

            {/* -------------------------------------------------------- */}
            {/* IF JOURNAL ENTRY EXISTS: BEFORE -> DURING -> AFTER       */}
            {/* -------------------------------------------------------- */}
            {entry ? (
              <>
                {/* BEFORE (PLAN) */}
                <View>
                  <SectionHeader
                    title="Before (Plan)"
                    subtitle="Initial thesis, parameters, and rule adherence."
                  />
                  <Card style={styles.rows}>
                    <DetailRow
                      label="Planned entry"
                      value={entry.planned_entry ? formatPrice(entry.planned_entry) : '—'}
                    />
                    <DetailRow
                      label="Stop loss"
                      value={entry.stop_loss ? formatPrice(entry.stop_loss) : '—'}
                    />
                    <DetailRow
                      label="Take profit"
                      value={entry.take_profit ? formatPrice(entry.take_profit) : '—'}
                    />
                    <DetailRow
                      label="Lot size"
                      value={entry.size ? formatPrice(entry.size) : '—'}
                    />

                    <View style={{ marginTop: 8 }}>
                      <ThemedText variant="label" tone="textSecondary">
                        Why this trade:
                      </ThemedText>
                      <ThemedText variant="body" style={{ marginTop: 2 }}>
                        {entry.reasons || 'No thesis provided.'}
                      </ThemedText>
                    </View>

                    {entry.feelings_before ? (
                      <View style={{ marginTop: 6 }}>
                        <ThemedText variant="label" tone="textSecondary">
                          Feelings before entry:
                        </ThemedText>
                        <ThemedText variant="body" tone="textTertiary" style={{ marginTop: 2 }}>
                          {entry.feelings_before}
                        </ThemedText>
                      </View>
                    ) : null}

                    {entry.rules_result && entry.rules_result.length > 0 ? (
                      <View style={{ marginTop: 8 }}>
                        <ThemedText variant="label" tone="textSecondary" style={{ marginBottom: 4 }}>
                          Rule Adherence:
                        </ThemedText>
                        {entry.rules_result.map((rr, idx) => (
                          <View key={idx} style={styles.ruleItem}>
                            <Pill
                              label={rr.met ? '✓ Met' : '✗ Missed'}
                              tone={rr.met ? 'gain' : 'loss'}
                              solid
                            />
                            <ThemedText variant="caption" style={{ flex: 1 }}>
                              {rr.rule}
                            </ThemedText>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {entry.flags && entry.flags.length > 0 ? (
                      <View style={styles.warningBox}>
                        <ThemedText variant="caption" tone="loss" style={{ fontWeight: '700' }}>
                          Risk Flags:
                        </ThemedText>
                        {entry.flags.map((fl, idx) => (
                          <ThemedText key={idx} variant="caption" tone="loss">
                            • {fl}
                          </ThemedText>
                        ))}
                      </View>
                    ) : null}
                  </Card>
                </View>

                {/* DURING (RUNNING TIMELINE) */}
                <View>
                  <SectionHeader
                    title="During (Running)"
                    subtitle="Check-in timeline, emotional state, and coach observations."
                  />
                  <Card style={styles.rows}>
                    {entry.checkins.length > 0 ? (
                      <View style={{ gap: 10 }}>
                        {entry.checkins.map((chk, idx) => (
                          <View key={idx} style={styles.checkinCard}>
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
                            ) : null}
                          </View>
                        ))}
                      </View>
                    ) : (
                      <ThemedText variant="body" tone="textTertiary">
                        No check-in notes were recorded while this trade was active.
                      </ThemedText>
                    )}
                  </Card>
                </View>

                {/* AFTER (CLOSED & REVIEW) */}
                <View>
                  <SectionHeader
                    title="After (Closed)"
                    subtitle="Exit execution and editable post-trade reflection."
                  />
                  <Card style={styles.rows}>
                    <DetailRow
                      label="Exit price"
                      value={formatPrice(Number(entry.exit_price ?? trade.exit_price))}
                    />
                    <DetailRow
                      label="Result P/L"
                      value={formatSigned(Number(entry.result_pl ?? trade.pl))}
                    />

                    <View style={{ marginTop: 8 }}>
                      <ThemedText variant="caption" tone="textSecondary">
                        Lesson Learned (Editable)
                      </ThemedText>
                      <Field
                        label=""
                        value={lesson}
                        onChangeText={setLesson}
                        placeholder="What did this trade teach you?"
                        multiline
                        numberOfLines={2}
                      />
                    </View>

                    <View style={{ marginTop: 4 }}>
                      <ThemedText variant="caption" tone="textSecondary">
                        Closing Thoughts (Editable)
                      </ThemedText>
                      <Field
                        label=""
                        value={thoughts}
                        onChangeText={setThoughts}
                        placeholder="Extra observations or market context..."
                        multiline
                        numberOfLines={2}
                      />
                    </View>

                    <View style={{ marginTop: 4 }}>
                      <ThemedText variant="caption" tone="textSecondary" style={{ marginBottom: 4 }}>
                        Emotion After Trade (Editable):
                      </ThemedText>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {MOOD_OPTIONS.map((m) => (
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

                    <Button
                      size="sm"
                      variant="secondary"
                      label={savingReview ? 'Saving changes…' : 'Save Review Changes'}
                      loading={savingReview}
                      onPress={handleSaveReview}
                      style={{ alignSelf: 'flex-start', marginTop: 10 }}
                    />
                  </Card>
                </View>
              </>
            ) : (
              /* -------------------------------------------------------- */
              /* SYNCED / IMPORTED TRADE (NO JOURNAL ENTRY)               */
              /* -------------------------------------------------------- */
              <>
                <View>
                  <SectionHeader title="Execution" subtitle="Recorded trade parameters." />
                  <Card style={styles.rows}>
                    <DetailRow label="Entry price" value={formatPrice(Number(trade.entry_price))} />
                    <DetailRow label="Exit price" value={formatPrice(Number(trade.exit_price))} />
                    <DetailRow label="Size" value={formatPrice(Number(trade.size))} />
                    <DetailRow label="Setup" value={displaySetup(trade.setup_type)} />
                  </Card>
                </View>

                {costs?.hasCosts ? (
                  <View>
                    <SectionHeader
                      title="Costs"
                      subtitle="What the market gave, and what the broker took."
                    />
                    <Card style={styles.rows}>
                      <DetailRow label="Gross P/L" value={formatSigned(costs.gross)} />
                      {trade.commission !== null ? (
                        <DetailRow label="Commission" value={formatSigned(costs.commission)} />
                      ) : null}
                      {trade.swap !== null ? (
                        <DetailRow label="Swap" value={formatSigned(costs.swap)} />
                      ) : null}
                      <DetailRow label="Net P/L" value={formatSigned(costs.net)} />
                      {costs.gross > 0 && costs.net < 0 ? (
                        <ThemedText variant="caption" tone="loss">
                          This trade was profitable on the chart and became a loss after costs.
                        </ThemedText>
                      ) : costs.total !== 0 ? (
                        <ThemedText variant="caption" tone="textTertiary">
                          {costs.total < 0
                            ? `Costs took ${formatPrice(Math.abs(costs.total))} off this trade.`
                            : `Carry added ${formatPrice(costs.total)} to this trade.`}
                        </ThemedText>
                      ) : null}
                    </Card>
                  </View>
                ) : null}

                {isImported(trade) ? (
                  <View>
                    <SectionHeader title="Sync" subtitle="Straight from your broker." />
                    <Card style={styles.rows}>
                      <DetailRow label="Source" value={sourceLabel(trade.source)} />
                      {trade.opened_at ? (
                        <DetailRow label="Opened" value={formatFullDate(trade.opened_at)} />
                      ) : null}
                      {trade.closed_at ? (
                        <DetailRow label="Closed" value={formatFullDate(trade.closed_at)} />
                      ) : null}
                      {held ? <DetailRow label="Held for" value={held} /> : null}
                    </Card>
                  </View>
                ) : null}

                {/* Notes card */}
                {trade.notes?.trim() ? (
                  <View>
                    <SectionHeader title="Notes" />
                    <Card>
                      <ThemedText variant="body">{trade.notes}</ThemedText>
                    </Card>
                  </View>
                ) : null}
              </>
            )}

            {/* -------------------------------------------------------- */}
            {/* MOODS TIMELINE & PSYCHOLOGY                              */}
            {/* -------------------------------------------------------- */}
            <View>
              <SectionHeader
                title="Moods & Psychology"
                subtitle="Emotional trajectory and mindset logged for this trade."
              />
              <Card style={styles.rows}>
                {tradeMoods.length > 0 || entry?.feelings_before || emotionAfter ? (
                  <View style={{ gap: 8 }}>
                    {entry?.feelings_before ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Pill label="Before" tone="neutral" />
                        <ThemedText variant="body" tone="textSecondary">
                          {entry.feelings_before}
                        </ThemedText>
                      </View>
                    ) : null}

                    {tradeMoods.length > 0 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <ThemedText variant="label" tone="textSecondary">
                          Tagged Moods:
                        </ThemedText>
                        {tradeMoods.map((m, idx) => (
                          <Pill key={`${m}-${idx}`} label={m} tone="accent" />
                        ))}
                      </View>
                    ) : null}

                    {emotionAfter ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Pill label="After" tone="neutral" />
                        <ThemedText variant="body" tone="textSecondary">
                          {emotionAfter}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <ThemedText variant="body" tone="textTertiary">
                    No moods logged yet for this trade.
                  </ThemedText>
                )}

                {/* Add Mood chip selector for fast tagging */}
                <View style={{ marginTop: 8 }}>
                  <ThemedText variant="caption" tone="textSecondary" style={{ marginBottom: 6 }}>
                    Add Mood Tag:
                  </ThemedText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {MOOD_OPTIONS.map((m) => (
                      <Pressable
                        key={m}
                        disabled={addingMood}
                        onPress={() => handleAddMoodToTrade(m)}
                      >
                        <Pill label={`+ ${m}`} tone="neutral" />
                      </Pressable>
                    ))}
                  </View>
                </View>

                {trade.motion_flag ? (
                  <View style={styles.motionBlock}>
                    <ThemedText variant="label" tone="textSecondary">
                      Motion at logging
                    </ThemedText>
                    <ThemedText variant="body" tone="textTertiary">
                      {motionLabel(trade.motion_flag)}
                    </ThemedText>
                  </View>
                ) : null}
              </Card>
            </View>

            {/* -------------------------------------------------------- */}
            {/* SCREENSHOTS (N OF 5, 2 MINIMUM)                          */}
            {/* -------------------------------------------------------- */}
            <View>
              <SectionHeader
                title={`Screenshots (${shots.length} of 5 • 2 min)`}
                subtitle="Rule requirement: at least 2 screenshots (entry & exit), up to 5 max."
              />
              <Card style={styles.rows}>
                {shots.length >= 2 ? (
                  <View style={styles.complianceBadge}>
                    <Pill label="Rule Met: 2+ Screenshots" tone="gain" solid />
                    <ThemedText variant="caption" tone="gain">
                      Both entry and exit documented ({shots.length}/5)
                    </ThemedText>
                  </View>
                ) : (
                  <View style={styles.warningBox}>
                    <ThemedText variant="caption" tone="loss" style={{ fontWeight: '700' }}>
                      {isImported(trade)
                        ? 'Imported trade arrived closed. Add screenshots (up to 5).'
                        : 'Rule requirement: 2 screenshots minimum (entry and exit).'}
                    </ThemedText>
                    <ThemedText variant="caption" tone="loss">
                      Currently {shots.length} attached ({2 - shots.length} needed to meet standard).
                    </ThemedText>
                  </View>
                )}

                {loadingShots ? (
                  <ActivityIndicator size="small" style={{ marginVertical: 12 }} />
                ) : shots.length > 0 ? (
                  <View style={styles.shotGrid}>
                    {shots.map((s) => (
                      <Pressable
                        key={s.id}
                        onPress={() => s.signed_url && setPreviewUrl(s.signed_url)}
                        style={styles.shotThumbnail}
                      >
                        {s.signed_url ? (
                          <Image
                            source={{ uri: s.signed_url }}
                            style={styles.thumbnailImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={[styles.thumbnailImage, { justifyContent: 'center', alignItems: 'center' }]}>
                            <ThemedText variant="caption" tone="textTertiary">
                              Loading…
                            </ThemedText>
                          </View>
                        )}
                        <View style={styles.shotPhaseTag}>
                          <Pill
                            label={s.phase.toUpperCase()}
                            tone={s.phase === 'before' ? 'accent' : s.phase === 'during' ? 'neutral' : 'gain'}
                            solid
                          />
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <ThemedText variant="body" tone="textTertiary">
                    No screenshots attached yet.
                  </ThemedText>
                )}

                {shots.length < 5 ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    label={uploadingShot ? 'Uploading…' : '+ Add Screenshot (up to 5)'}
                    loading={uploadingShot}
                    onPress={handleAddShot}
                    style={{ alignSelf: 'flex-start', marginTop: 10 }}
                  />
                ) : (
                  <ThemedText variant="caption" tone="textTertiary" style={{ marginTop: 6 }}>
                    Maximum of 5 screenshots reached.
                  </ThemedText>
                )}
              </Card>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        ) : null}
      </Sheet>

      {/* Image Preview Modal */}
      {previewUrl ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPreviewUrl(null)}>
          <Pressable style={styles.modalOverlay} onPress={() => setPreviewUrl(null)}>
            <View style={styles.modalContent}>
              <Image source={{ uri: previewUrl }} style={styles.modalImage} resizeMode="contain" />
              <Button
                variant="secondary"
                label="Close Preview"
                onPress={() => setPreviewUrl(null)}
                style={{ marginTop: 16, alignSelf: 'center' }}
              />
            </View>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(sheet);
  return (
    <View style={styles.detailRow}>
      <ThemedText variant="body" tone="textSecondary">
        {label}
      </ThemedText>
      <ThemedText variant="mono" style={styles.detailValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    scrollContent: {
      paddingBottom: 40,
      gap: t.space.three,
    },
    plCard: {
      backgroundColor: t.color.hero,
      borderRadius: t.radius.xl,
      padding: t.space.four,
      gap: t.space.one,
      alignItems: 'flex-start',
    },
    plMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: t.space.one,
      marginTop: t.space.one,
    },
    rows: {
      gap: t.space.two,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.three,
    },
    detailValue: {
      flexShrink: 1,
      textAlign: 'right',
    },
    ruleItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginVertical: 3,
    },
    warningBox: {
      padding: 10,
      borderRadius: 8,
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.25)',
      marginTop: 4,
      gap: 2,
    },
    complianceBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 8,
      borderRadius: 8,
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      marginBottom: 6,
    },
    checkinCard: {
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: t.color.surfaceActive,
    },
    coachReply: {
      marginTop: 6,
      padding: 8,
      borderRadius: 6,
      backgroundColor: t.color.surface,
      borderLeftWidth: 3,
      borderLeftColor: t.color.accent,
    },
    motionBlock: {
      gap: t.space.half,
      marginTop: t.space.two,
    },
    shotGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 8,
    },
    shotThumbnail: {
      width: 100,
      height: 100,
      borderRadius: 10,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: t.color.border,
      position: 'relative',
    },
    thumbnailImage: {
      width: '100%',
      height: '100%',
      backgroundColor: '#111',
    },
    shotPhaseTag: {
      position: 'absolute',
      bottom: 4,
      left: 4,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
    },
    modalContent: {
      width: '100%',
      maxWidth: 600,
      alignItems: 'center',
    },
    modalImage: {
      width: '100%',
      height: 400,
      borderRadius: 12,
    },
  });
