/**
 * One journal entry: the plan you wrote, a check-in for when you doubt yourself
 * mid-trade, and a close-out review afterwards.
 *
 * The coach here only reflects YOUR written plan back at you. It never tells you
 * to hold, close, or move a stop.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { gradeTone } from '@/components/journal-sheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import { VoiceButton } from '@/components/voice-button';
import type { Theme } from '@/constants/theme';
import { coachCheckin, reviewTrade, updateEntry, type JournalEntry } from '@/lib/journal';
import { useThemedStyles } from '@/lib/styles';

type JournalEntrySheetProps = {
  entry: JournalEntry | null;
  onClose: () => void;
  onChanged: () => void;
};

const show = (value: number | null) => (value === null ? '—' : String(value));

export function JournalEntrySheet({ entry, onClose, onChanged }: JournalEntrySheetProps) {
  const styles = useThemedStyles(sheet);

  const [current, setCurrent] = useState<JournalEntry | null>(entry);
  const [checkinText, setCheckinText] = useState('');
  const [resultText, setResultText] = useState('');
  const [afterText, setAfterText] = useState('');
  const [busy, setBusy] = useState<'checkin' | 'close' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(entry);
    setCheckinText('');
    setResultText('');
    setAfterText('');
    setError(null);
  }, [entry]);

  if (!current) {
    return null;
  }

  const closed = current.status === 'closed';

  const handleCheckin = async () => {
    const text = checkinText.trim();
    if (!text) {
      setError('Say how you feel right now, then check in.');
      return;
    }
    setBusy('checkin');
    setError(null);
    try {
      const reply = await coachCheckin(current, text);
      const checkins = [...current.checkins, { at: new Date().toISOString(), text, reply }];
      const updated = await updateEntry(current.id, {
        checkins,
        status: current.status === 'planned' ? 'open' : current.status,
      });
      setCurrent(updated);
      setCheckinText('');
      onChanged();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Check-in failed. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleClose = async () => {
    const raw = resultText.trim();
    const pl = raw ? Number(raw) : null;
    if (pl !== null && !Number.isFinite(pl)) {
      setError('Result must be a number, like 18 or -18.');
      return;
    }
    setBusy('close');
    setError(null);
    try {
      const review = await reviewTrade(current, pl, afterText.trim());
      const updated = await updateEntry(current.id, {
        status: 'closed',
        result_pl: pl,
        feelings_after: afterText.trim() || null,
        review,
        closed_at: new Date().toISOString(),
      });
      setCurrent(updated);
      onChanged();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not close the trade. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={`${current.pair} ${current.direction.toUpperCase()}`}
      subtitle={closed ? 'Closed. Plan versus what happened.' : 'Your plan, written before you entered.'}
      footer={<Button label="Done" variant="secondary" size="lg" block onPress={onClose} />}
    >
      <View style={styles.stack}>
        <Card style={styles.card}>
          <View style={styles.topRow}>
            <ThemedText variant="monoXl" tone={gradeTone(current.grade)}>
              {current.grade ?? '—'}
            </ThemedText>
            <Pill label={current.status} />
          </View>
          <View style={styles.numbers}>
            <ThemedText variant="mono">Entry {show(current.planned_entry)}</ThemedText>
            <ThemedText variant="mono">Stop {show(current.stop_loss)}</ThemedText>
            <ThemedText variant="mono">Target {show(current.take_profit)}</ThemedText>
            <ThemedText variant="mono">Lots {show(current.size)}</ThemedText>
          </View>
          <ThemedText variant="bodyStrong">Why you took it</ThemedText>
          <ThemedText variant="body" tone="textSecondary">
            {current.reasons}
          </ThemedText>
          {current.feelings_before ? (
            <>
              <ThemedText variant="bodyStrong">How you felt</ThemedText>
              <ThemedText variant="body" tone="textSecondary">
                {current.feelings_before}
              </ThemedText>
            </>
          ) : null}
          {current.flags.map((flag) => (
            <ThemedText key={flag} variant="caption" tone="loss">
              Warning: {flag}
            </ThemedText>
          ))}
          {current.rules_result.map((result) => (
            <ThemedText key={result.rule} variant="caption" tone={result.met ? 'gain' : 'loss'}>
              {result.met ? '✓' : '✗'} {result.rule}
            </ThemedText>
          ))}
        </Card>

        {current.checkins.length > 0 ? (
          <View>
            <SectionHeader title="Check-ins" />
            <Card style={styles.card}>
              {current.checkins.map((checkin) => (
                <View key={checkin.at} style={styles.checkin}>
                  <ThemedText variant="body">{checkin.text}</ThemedText>
                  {checkin.reply ? (
                    <ThemedText variant="body" tone="textSecondary">
                      Coach: {checkin.reply}
                    </ThemedText>
                  ) : null}
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {!closed ? (
          <View>
            <SectionHeader
              title="Doubting yourself?"
              subtitle="Tell the coach. It will show you your own plan, not tell you what to do."
            />
            <Card style={styles.card}>
              <Field
                label="How do you feel right now?"
                value={checkinText}
                onChangeText={setCheckinText}
                placeholder="It's 4 points from my target and it just reversed..."
                multiline
                inputStyle={styles.textArea}
                editable={busy === null}
              />
              <VoiceButton
                label="Speak"
                disabled={busy !== null}
                onText={(text) => setCheckinText((c) => (c.trim() ? `${c.trim()} ${text}` : text))}
              />
              <Button
                label="Check in"
                loading={busy === 'checkin'}
                disabled={busy !== null}
                onPress={handleCheckin}
              />
            </Card>
          </View>
        ) : null}

        {!closed ? (
          <View>
            <SectionHeader title="Trade finished?" subtitle="Close it out and get a plan-versus-result review." />
            <Card style={styles.card}>
              <Field
                label="Result (profit or loss, optional)"
                value={resultText}
                onChangeText={setResultText}
                placeholder="-18"
                keyboardType="numbers-and-punctuation"
                numeric
                editable={busy === null}
              />
              <Field
                label="How did it go? How do you feel about it?"
                value={afterText}
                onChangeText={setAfterText}
                placeholder="I moved to breakeven early, then it went to target..."
                multiline
                inputStyle={styles.textArea}
                editable={busy === null}
              />
              <VoiceButton
                label="Speak"
                disabled={busy !== null}
                onText={(text) => setAfterText((c) => (c.trim() ? `${c.trim()} ${text}` : text))}
              />
              <Button
                label="Close and review"
                variant="secondary"
                loading={busy === 'close'}
                disabled={busy !== null}
                onPress={handleClose}
              />
            </Card>
          </View>
        ) : (
          <View>
            <SectionHeader title="Review" />
            <Card style={styles.card}>
              {current.result_pl !== null ? (
                <ThemedText variant="monoLg" tone={current.result_pl >= 0 ? 'gain' : 'loss'}>
                  {current.result_pl >= 0 ? '+' : ''}
                  {current.result_pl}
                </ThemedText>
              ) : null}
              {current.feelings_after ? (
                <ThemedText variant="body" tone="textSecondary">
                  You said: {current.feelings_after}
                </ThemedText>
              ) : null}
              <ThemedText variant="body">{current.review}</ThemedText>
            </Card>
          </View>
        )}

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
    card: {
      gap: t.space.two,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    numbers: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: t.space.three,
    },
    checkin: {
      gap: t.space.one,
      paddingBottom: t.space.two,
    },
    textArea: {
      height: 96,
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
