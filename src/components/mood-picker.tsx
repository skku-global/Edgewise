/**
 * Single-select mood picker.
 *
 * Shared by the Add Trade form and the tagging queue, which asked the same
 * question with two different sets of chips — different padding, different
 * active colour, and only one of them announcing the selection to a screen
 * reader. This is the app's most important input; it gets one implementation.
 *
 * `accessibilityState.selected` matters here more than anywhere else in the app:
 * a green fill conveys nothing to a screen reader, and a mood logged by accident
 * is data the insight engine will happily draw a conclusion from.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { Theme } from '@/constants/theme';
import { MOOD_OPTIONS, type MoodValue } from '@/lib/moods';
import { useThemedStyles } from '@/lib/styles';

export type MoodPickerProps = {
  value: MoodValue | null;
  onChange: (mood: MoodValue) => void;
  disabled?: boolean;
};

export function MoodPicker({ value, onChange, disabled = false }: MoodPickerProps) {
  const styles = useThemedStyles(sheet);

  return (
    <View style={styles.row}>
      {MOOD_OPTIONS.map((option) => {
        const active = value === option.value;

        return (
          <Pressable
            key={option.value}
            testID={`mood-${option.value}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.chipPressed,
            ]}
          >
            <ThemedText variant="label" tone={active ? 'textOnFill' : 'text'}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: t.space.one,
    },
    chip: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.borderStrong,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space.three,
      paddingVertical: t.space.two,
      backgroundColor: t.color.bgSunken,
    },
    chipActive: {
      backgroundColor: t.color.accent,
      borderColor: t.color.accent,
    },
    chipPressed: {
      opacity: 0.75,
    },
  });
