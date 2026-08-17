/**
 * Segmented control.
 *
 * Two or three mutually exclusive modes, shown together so the alternative is
 * visible before it is chosen. On the auth screen this replaces a ghost button
 * reading "I already have an account" — the button worked, but it hid half the
 * screen's purpose behind a line of small text, and switching felt like
 * navigating rather than toggling.
 *
 * The indicator slides. It is the whole reason to build this instead of two
 * Pressables: the movement is what tells you the two options are one control
 * with one value, and a hard cut between highlighted labels does not.
 *
 * Width comes from `onLayout` rather than being passed in, so the control can
 * sit in a flexible column without the caller doing arithmetic. The indicator
 * is not rendered until that measurement lands — one frame — because animating
 * `translateX` against a zero width would park it in the wrong place.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemedStyles } from '@/lib/styles';

/** Inset of the indicator from the track on all four sides. */
const TrackPadding = 4;

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

export type SegmentedProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  style,
}: SegmentedProps<T>) {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);

  const [trackWidth, setTrackWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const slide = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: index,
      duration: theme.duration.base,
      // Decelerating rather than linear: the indicator should arrive settling,
      // not stop dead.
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [index, slide, theme.duration.base]);

  const segmentWidth =
    trackWidth > 0 ? (trackWidth - TrackPadding * 2) / options.length : 0;

  const onTrackLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next !== trackWidth) {
      setTrackWidth(next);
    }
  };

  return (
    <View style={[styles.track, style]} onLayout={onTrackLayout}>
      {segmentWidth > 0 ? (
        <Animated.View
          // Decorative: the selected state is announced on the option itself.
          aria-hidden
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: segmentWidth,
              transform: [
                {
                  translateX: slide.interpolate({
                    inputRange: options.map((_, position) => position),
                    outputRange: options.map((_, position) => position * segmentWidth),
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}

      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={styles.segment}
          >
            <ThemedText
              variant="label"
              tone={selected ? 'text' : 'textSecondary'}
              numberOfLines={1}
            >
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
    track: {
      flexDirection: 'row',
      height: 44,
      padding: TrackPadding,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.bgSunken,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.border,
    },
    // Absolute, so it sits under the labels and its movement does not reflow
    // them. `left` is the padding; `translateX` carries it from there.
    indicator: {
      position: 'absolute',
      left: TrackPadding,
      top: TrackPadding,
      bottom: TrackPadding,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.surface,
      ...t.elevation[1],
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
