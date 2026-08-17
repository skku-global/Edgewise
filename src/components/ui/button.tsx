/**
 * The button.
 *
 * Four variants covering every action in the app, so no screen needs to invent
 * its own Pressable-plus-Text again:
 *
 *   primary   — the one thing this screen is for. Solid accent.
 *   secondary — a real alternative to the primary. Outlined.
 *   ghost     — low-stakes, usually beside something else. No chrome until hover.
 *   danger    — destructive and irreversible. Solid loss red.
 *
 * Press feedback is a scale-down rather than an opacity fade. Fading a solid
 * button lets the page show through it, which looks like a rendering fault;
 * scaling reads as the surface being pushed. It runs on the native driver, so it
 * stays smooth while the JS thread is busy submitting the form the button
 * belongs to.
 */

import { forwardRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText, type TextTone } from '@/components/themed-text';
import type { Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemedStyles } from '@/lib/styles';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner in place of the label and blocks presses. */
  loading?: boolean;
  /** Rendered before the label. An icon, usually. */
  leading?: React.ReactNode;
  /** Fills the width of its container. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const Button = forwardRef<View, ButtonProps>(function Button(
  {
    label,
    variant = 'primary',
    size = 'md',
    loading = false,
    leading,
    block = false,
    disabled,
    style,
    ...rest
  },
  ref,
) {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);
  const [scale] = useState(() => new Animated.Value(1));

  const inert = disabled || loading;

  const springTo = (value: number) => {
    Animated.timing(scale, {
      toValue: value,
      duration: theme.duration.fast,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[block && styles.block, { transform: [{ scale }] }]}>
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!inert, busy: loading }}
        // The label is on a child Text node, but a spinner replaces it while
        // loading — so name the control explicitly and it stays announced.
        accessibilityLabel={label}
        disabled={inert}
        onPressIn={() => springTo(0.97)}
        onPressOut={() => springTo(1)}
        style={[
          styles.base,
          styles[size],
          styles[variant],
          block && styles.block,
          inert && styles.inert,
          style,
        ]}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator size="small" color={theme.color[spinnerTone[variant]]} />
        ) : (
          <>
            {leading}
            <ThemedText variant={size === 'sm' ? 'label' : 'subheading'} tone={labelTone[variant]}>
              {label}
            </ThemedText>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
});

const labelTone: Record<ButtonVariant, TextTone> = {
  primary: 'textOnFill',
  secondary: 'text',
  ghost: 'accentText',
  danger: 'textOnFill',
};

/**
 * Spinner colour, keyed the same way. `textOnFill` rather than the raw token,
 * because on a solid accent fill that is the only value that stays visible in
 * both schemes — dark mode's accent is the bright green, and white on it is
 * nearly invisible.
 */
const spinnerTone: Record<ButtonVariant, 'textOnFill' | 'text' | 'accent'> = {
  primary: 'textOnFill',
  secondary: 'text',
  ghost: 'accent',
  danger: 'textOnFill',
};

const sheet = (t: Theme) =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.space.two,
      borderRadius: t.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'transparent',
    },
    block: {
      width: '100%',
    },
    // Heights are fixed rather than derived from padding, so a spinner and a
    // label produce the same box and the layout does not jump on submit.
    sm: { height: 34, paddingHorizontal: t.space.three },
    md: { height: 44, paddingHorizontal: t.space.four },
    lg: { height: 54, paddingHorizontal: t.space.four },

    primary: {
      backgroundColor: t.color.accent,
      ...t.elevation[1],
    },
    secondary: {
      backgroundColor: t.color.surface,
      borderColor: t.color.borderStrong,
    },
    ghost: {
      backgroundColor: 'transparent',
    },
    danger: {
      backgroundColor: t.color.loss,
      ...t.elevation[1],
    },
    inert: {
      // Low enough to read as unavailable, high enough that the label is still
      // legible — a disabled control nobody can read is a support ticket.
      opacity: 0.45,
    },
  });
