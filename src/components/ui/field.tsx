/**
 * Labelled text input.
 *
 * Three things it fixes that the hand-rolled inputs across the app did not:
 *
 *   - Focus is visible. The border thickens to the focus token, so keyboard and
 *     switch-control users can see where they are. Every input in the app before
 *     this was a static hairline.
 *   - The placeholder colour comes from a token, so it is not invisible in dark
 *     mode.
 *   - `error` shows under the field rather than in a banner at the top of the
 *     form, next to the input that caused it.
 *
 * `autoComplete` and `textContentType` are passed straight through and callers
 * are expected to set them — that is what lets a password manager fill the form,
 * and the login screen was missing both.
 */

import { forwardRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemedStyles } from '@/lib/styles';

export type FieldProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  /** Shown under the field, in loss red. Also turns the border red. */
  error?: string;
  /** Shown under the field when there is no error. */
  hint?: string;
  /** Sets the input in the mono face, for prices and sizes. */
  numeric?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, hint, numeric = false, containerStyle, inputStyle, onFocus, onBlur, ...rest },
  ref,
) {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.group, containerStyle]}>
      {label ? (
        <ThemedText variant="label" tone="textSecondary">
          {label}
        </ThemedText>
      ) : null}

      <TextInput
        ref={ref}
        style={[
          styles.input,
          numeric && styles.numeric,
          focused && styles.focused,
          !!error && styles.errored,
          inputStyle,
        ]}
        placeholderTextColor={theme.color.textTertiary}
        // iOS renders the caret in the system blue otherwise, which is the one
        // colour the brand palette does not contain.
        selectionColor={theme.color.accent}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...rest}
      />

      {error ? (
        <ThemedText variant="caption" tone="loss">
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText variant="caption" tone="textTertiary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
});

const sheet = (t: Theme) =>
  StyleSheet.create({
    group: {
      gap: t.space.one,
    },
    input: {
      height: 48,
      borderWidth: 1,
      borderColor: t.color.borderStrong,
      borderRadius: t.radius.md,
      paddingHorizontal: t.space.three,
      backgroundColor: t.color.bgSunken,
      color: t.color.text,
      ...t.type.body,
      // 16px minimum on web: anything smaller makes mobile Safari zoom the
      // viewport on focus and never zoom back out.
      fontSize: 16,
    },
    numeric: {
      ...t.type.mono,
      fontSize: 16,
    },
    focused: {
      borderColor: t.color.focus,
      backgroundColor: t.color.surface,
    },
    // After `focused` in the array, so an errored field that gains focus still
    // shows red — the error is the more important signal.
    errored: {
      borderColor: t.color.loss,
      backgroundColor: t.color.lossSoft,
    },
  });
