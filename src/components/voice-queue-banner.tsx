/**
 * Shows "N voice notes waiting" when recordings were saved without internet,
 * with a button that writes them out and hands the words to `onText`.
 * Renders nothing when the queue is empty.
 */

import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import type { Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/styles';
import { queueCount, subscribeQueue, transcribeQueued } from '@/lib/voice-queue';

type VoiceQueueBannerProps = {
  onText: (text: string) => void;
};

export function VoiceQueueBanner({ onText }: VoiceQueueBannerProps) {
  const styles = useThemedStyles(sheet);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    queueCount().then(setCount, () => undefined);
  }, []);

  useEffect(() => {
    refresh();
    return subscribeQueue(refresh);
  }, [refresh]);

  const writeOut = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await transcribeQueued();
      if (result.texts.length > 0) {
        onText(result.texts.join(' '));
      }
      if (result.left > 0) {
        setMessage('Still no internet. Your recordings are safe and will wait.');
      } else if (result.failed > 0) {
        setMessage(`${result.failed} recording(s) had no clear speech and were dropped.`);
      }
    } catch (err) {
      console.error(err);
      setMessage(err instanceof Error ? err.message : 'Could not write them out. Try again.');
    } finally {
      setBusy(false);
      refresh();
    }
  };

  if (count === 0 && !message) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      {count > 0 ? (
        <>
          <ThemedText variant="label" tone="text" style={styles.text}>
            {count} voice {count === 1 ? 'note' : 'notes'} saved on this device, waiting for internet.
          </ThemedText>
          <Button label="Write them out" variant="secondary" loading={busy} onPress={writeOut} />
        </>
      ) : null}
      {message ? (
        <ThemedText variant="caption" tone="textSecondary">
          {message}
        </ThemedText>
      ) : null}
    </View>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    wrap: {
      gap: t.space.two,
      padding: t.space.three,
      borderRadius: t.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.accent,
      backgroundColor: t.color.accentSoft,
    },
    text: {
      flexShrink: 1,
    },
  });
