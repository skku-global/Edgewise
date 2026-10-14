/**
 * A small "Speak" button: record, turn the clip into text through the proxy,
 * and hand the words to `onText`. It never sends or saves anything itself.
 */

import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemedStyles } from '@/lib/styles';
import { transcribeRecording } from '@/lib/voice';

type VoiceButtonProps = {
  onText: (text: string) => void;
  disabled?: boolean;
  label?: string;
};

export function VoiceButton({ onText, disabled, label = 'Speak' }: VoiceButtonProps) {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const recording = state.isRecording;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async () => {
    setError(null);
    try {
      if (recording) {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) {
          throw new Error('The recording was empty. Hold the mic a little longer.');
        }
        setBusy(true);
        onText(await transcribeRecording(uri));
        return;
      }

      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) {
        setError('Microphone permission was denied. Turn it on in your phone settings.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Voice failed. Try again.');
    } finally {
      setBusy(false);
    }
  }, [onText, recorder, recording]);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Stop recording' : 'Record by voice'}
        onPress={toggle}
        disabled={(disabled || busy) && !recording}
        style={({ pressed }) => [
          styles.button,
          recording && styles.active,
          (disabled || busy) && !recording && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={theme.color.accent} />
        ) : (
          <Ionicons
            name={recording ? 'stop' : 'mic'}
            size={18}
            color={recording ? theme.color.loss : theme.color.text}
          />
        )}
        <ThemedText variant="label" tone={recording ? 'loss' : 'text'}>
          {busy ? 'Writing it down…' : recording ? 'Tap to stop' : label}
        </ThemedText>
      </Pressable>
      {error ? (
        <ThemedText variant="caption" tone="loss">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    wrap: {
      gap: t.space.one,
      alignItems: 'flex-start',
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.one,
      minHeight: 40,
      paddingHorizontal: t.space.three,
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.color.borderStrong,
      backgroundColor: t.color.bgSunken,
    },
    active: {
      borderColor: t.color.loss,
      backgroundColor: t.color.lossSoft,
    },
    disabled: {
      opacity: 0.4,
    },
    pressed: {
      opacity: 0.7,
    },
  });
