/**
 * Height-animated container for content that comes and goes.
 *
 * Used by the auth screen for the two name fields, which exist on sign-up and
 * not on sign-in. Without this the card jumps by 70px the instant the mode
 * changes, and that jump is the difference between a form that feels built and
 * one that feels assembled.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CHILDREN UNMOUNT
 * ---------------------------------------------------------------------------
 * The obvious implementation keeps them mounted and animates the wrapper to
 * zero height. That leaves two text inputs in the tree that are invisible but
 * still reachable: on web, Tab walks straight into a collapsed field, and a
 * screen reader reads it out. So children mount when opening and unmount only
 * once the closing animation has finished — the animation is the thing that
 * needs them present, and nothing after it does.
 *
 * ---------------------------------------------------------------------------
 * WHY HEIGHT IS MEASURED AND NOT PASSED IN
 * ---------------------------------------------------------------------------
 * A hardcoded height silently clips the moment a validation message appears
 * under one of the fields. So the inner view reports its natural height through
 * `onLayout` while the outer one is still zero-height and clipping — a child of
 * a zero-height `overflow: hidden` box is laid out at its own size, it is just
 * not painted, so the measurement is real. The animation starts on the frame
 * after that.
 *
 * `useNativeDriver` is off here, and has to be: height is a layout property and
 * the native driver only handles transforms and opacity.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemedStyles } from '@/lib/styles';

export type RevealProps = {
  open: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Reveal({ open, children, style }: RevealProps) {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);

  const [mounted, setMounted] = useState(open);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  // Opening is two steps: mount, then animate once the height is known.
  useEffect(() => {
    if (open) {
      setMounted(true);
    }
  }, [open]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    // Opening with no measurement yet: wait for the layout pass that provides
    // it. This effect runs again when it lands.
    if (open && contentHeight === null) {
      return;
    }

    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: theme.duration.base,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      if (finished && !open) {
        setMounted(false);
        // Dropped so the next open measures again — the content may differ.
        setContentHeight(null);
      }
    });

    return () => animation.stop();
  }, [open, mounted, contentHeight, progress, theme.duration.base]);

  if (!mounted) {
    return null;
  }

  const onContentLayout = (event: LayoutChangeEvent) => {
    if (contentHeight === null) {
      setContentHeight(event.nativeEvent.layout.height);
    }
  };

  return (
    <Animated.View
      style={[
        styles.clip,
        {
          // Zero until measured, so the unmeasured frame is collapsed rather
          // than a full-height flash that then animates shut.
          height:
            contentHeight === null
              ? 0
              : progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, contentHeight],
                }),
          opacity: progress,
        },
        style,
      ]}
    >
      <View onLayout={onContentLayout}>{children}</View>
    </Animated.View>
  );
}

const sheet = (_t: Theme) =>
  StyleSheet.create({
    clip: {
      overflow: 'hidden',
    },
  });
