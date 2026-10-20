/**
 * A small "Speak" button: record (mono, 16 kHz, low bitrate), turn the clip into text through the proxy,
 * and hand the words to `onText`.
 */

import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemedStyles } from '@/lib/styles';
import { transcribeOrQueue } from '@/lib/voice-queue';

/** Low-bandwidth, speech-optimized recording options (mono, 16 kHz, 32 kbps). */
const FAST_VOICE_PRESET: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    sampleRate: 16000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.LOW,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 32000,
  },
};

type VoiceButtonProps = {
  onText: (text: string) => void;
  disabled?: boolean;
  label?: string;
};

export function VoiceButton({ onText, disabled, label = 'Speak' }: VoiceButtonProps) {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);

  const recorder = useAudioRecorder(FAST_VOICE_PRESET);
  const state = useAudioRecorderState(recorder);
  const recording = state.isRecording;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = useCallback(async () => {
    setError(null);
    setNotice(null);
    try {
      if (recording) {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) {
          throw new Error('The recording was empty. Hold the mic a little longer.');
        }

        // Upload immediately on stop without freezing form input
        setBusy(true);
        transcribeOrQueue(uri)
          .then((result) => {
            if (result.queued) {
              setNotice('No internet. Saved on this device. Use "Write them out" when you are back online.');
            } else if (result.text) {
              onText(result.text);
            }
          })
          .catch((err) => {
            console.error('Transcription error:', err);
            setError(err instanceof Error ? err.message : 'Transcription failed.');
          })
          .finally(() => {
            setBusy(false);
          });
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
          {busy ? 'Transcribing…' : recording ? 'Tap to stop' : label}
        </ThemedText>
      </Pressable>
      {notice ? (
        <ThemedText variant="caption" tone="textSecondary">
          {notice}
        </ThemedText>
      ) : null}
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
