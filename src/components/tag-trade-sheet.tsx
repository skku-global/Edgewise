/**
 * The tagging queue: the one manual act left once trades import themselves.
 *
 * A synced trade arrives with real numbers and no psychology — the broker knows
 * what happened but not how it felt or why it was taken. This sheet walks the
 * untagged trades one at a time and asks those two questions, so the mood data
 * the whole insight layer depends on keeps arriving after the numbers stop
 * needing to be typed.
 *
 * One trade per screen on purpose. A list of ten rows with ten mood pickers
 * invites skipping the lot; a single question with a Skip button gets answered.
 *
 * Writes are the same two shapes the Add Trade form uses: an insert into
 * `moods` (with the accelerometer reading from `readMotionFlag`) and, when a
 * setup is chosen, an update to the trade's `setup_type`.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MoodPicker } from '@/components/mood-picker';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Dropdown } from '@/components/ui/dropdown';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/state';
import type { Theme } from '@/constants/theme';
import { formatFullDate, formatPrice, formatSigned } from '@/lib/format';
import { type MoodValue } from '@/lib/moods';
import { readMotionFlag } from '@/lib/motion-sensor';
import { SETUP_TYPES } from '@/lib/setup-types';
import { useThemedStyles } from '@/lib/styles';
import { supabase } from '@/lib/supabase';
import type { TradeRow } from '@/lib/trade-table';

const SETUP_OPTIONS = SETUP_TYPES.map((setup) => ({ label: setup, value: setup as string | null }));

type TagTradeSheetProps = {
  visible: boolean;
  /** The queue, newest first — normally `untaggedTrades(trades)`. */
  trades: TradeRow[];
  onClose: () => void;
  /** Called after each successful tag so the caller can refresh its data. */
  onSaved: () => void;
};

export function TagTradeSheet({ visible, trades, onClose, onSaved }: TagTradeSheetProps) {
  const styles = useThemedStyles(sheet);

  const [handled, setHandled] = useState<number[]>([]);
  const [mood, setMood] = useState<MoodValue | null>(null);
  const [setup, setSetup] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagged, setTagged] = useState(0);

  useEffect(() => {
    if (visible) {
      setHandled([]);
      setMood(null);
      setSetup(null);
      setError(null);
      setTagged(0);
    }
  }, [visible]);

  // Ids tagged or skipped in this sitting are dropped locally rather than
  // waited on. The parent's refresh is a round trip, and until it lands the
  // prop still contains the trade just saved -- indexing into the prop would
  // leave that trade on screen long enough to be tagged a second time.
  const queue = trades.filter((row) => !handled.includes(row.id));
  const trade = queue[0] ?? null;

  const advance = (id: number) => {
    setHandled((current) => (current.includes(id) ? current : [...current, id]));
    setMood(null);
    setSetup(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!trade || !mood) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const motionFlag = await readMotionFlag();

      const { error: moodError } = await supabase
        .from('moods')
        .insert([{ trade_id: trade.id, mood_tag: mood, motion_flag: motionFlag }]);

      if (moodError) {
        throw moodError;
      }

      // Setup is optional: the mood is the answer that matters and the one the
      // insight engine reads. A trade can be tagged now and classified later.
      if (setup) {
        const { error: setupError } = await supabase
          .from('trades')
          .update({ setup_type: setup })
          .eq('id', trade.id);

        if (setupError) {
          throw setupError;
        }
      }

      setTagged((count) => count + 1);
      advance(trade.id);
      onSaved();
    } catch (err) {
      console.error(err);
      setError('Unable to save that right now. Your other tags are safe.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="How did you feel?"
      subtitle={
        trade
          ? `${queue.length} ${queue.length === 1 ? 'trade' : 'trades'} left to tag`
          : undefined
      }
      footer={
        trade ? (
          <>
            <Button
              testID="tag-save"
              label={queue.length > 1 ? 'Save and next' : 'Save'}
              size="lg"
              block
              loading={saving}
              disabled={!mood}
              onPress={handleSave}
            />
            {/* Skip steps past this trade without recording anything. A guessed
                mood is worse than a missing one: it feeds the insight a number
                the user does not actually believe. */}
            <Button
              label="Skip this one"
              variant="ghost"
              block
              disabled={saving}
              onPress={() => advance(trade.id)}
            />
          </>
        ) : null
      }
    >
      {trade === null ? (
        <EmptyState
          title={handled.length > 0 ? 'All caught up' : 'Nothing to tag'}
          body={
            tagged > 0
              ? `You tagged ${tagged} ${tagged === 1 ? 'trade' : 'trades'}. That is the data the mood pattern reads.`
              : handled.length > 0
                ? 'Nothing left in the queue. Skipped trades come back next time — an untagged trade is a question still worth answering.'
                : 'Every synced trade already has a mood. New ones show up here as they arrive.'
          }
          action={<Button label="Done" onPress={onClose} />}
        />
      ) : (
        <>
          {/* The numbers first: the question is unanswerable without remembering
              which trade it is about. */}
          <View style={styles.plCard}>
            <View style={styles.plHeader}>
              <ThemedText variant="bodyStrong" tone="heroText">
                {trade.pair.toUpperCase()}
              </ThemedText>
              <Pill
                label={trade.direction}
                tone={trade.direction === 'buy' ? 'gain' : 'loss'}
                solid
                caps
              />
            </View>

            <ThemedText variant="monoXl" tone={trade.pl >= 0 ? 'gain' : 'loss'}>
              {formatSigned(trade.pl)}
            </ThemedText>

            <ThemedText variant="caption" tone="heroMuted">
              {formatPrice(Number(trade.entry_price))} → {formatPrice(Number(trade.exit_price))} ·{' '}
              {formatPrice(Number(trade.size))} lots
            </ThemedText>
            <ThemedText variant="caption" tone="heroMuted">
              {formatFullDate(trade.closed_at ?? trade.created_at)}
            </ThemedText>
          </View>

          <View>
            <SectionHeader
              title="Mood when you took it"
              subtitle="Answer honestly rather than kindly — this is the column the pattern engine reads."
            />
            <Card>
              <MoodPicker value={mood} onChange={setMood} disabled={saving} />
            </Card>
          </View>

          <View>
            <SectionHeader
              title="Setup (optional)"
              subtitle="Your broker knows what happened, not why you took it."
            />
            <Card>
              <Dropdown
                value={setup}
                options={SETUP_OPTIONS}
                onChange={setSetup}
                placeholder="Select a setup"
                testID="tag-setup-dropdown"
              />
            </Card>
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <ThemedText variant="label" tone="loss">
                {error}
              </ThemedText>
            </View>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

/**
 * A single-select mood picker lives in `@/components/mood-picker` — shared with
 * the Add Trade form so the app asks its one important question the same way in
 * both places.
 */
const sheet = (t: Theme) =>
  StyleSheet.create({
    plCard: {
      backgroundColor: t.color.hero,
      borderRadius: t.radius.xl,
      padding: t.space.four,
      gap: t.space.half,
      alignItems: 'flex-start',
    },
    plHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.two,
      marginBottom: t.space.one,
    },
    errorBanner: {
      backgroundColor: t.color.lossSoft,
      borderColor: t.color.loss,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: t.radius.md,
      padding: t.space.three,
    },
  });
