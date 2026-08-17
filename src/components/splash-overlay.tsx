/**
 * Cross-fade out of the native splash screen.
 *
 * The native splash is a static image that vanishes the instant it is hidden.
 * Hiding it while this overlay is already on screen — painted in the same
 * charcoal, with the same mark — turns that hard cut into a fade, which is the
 * whole reason it exists.
 *
 * Two things it deliberately does not do:
 *
 *   - It does not use Reanimated. This is one opacity tween on a view that is
 *     about to unmount; RN's own Animated runs it on the native driver, works
 *     identically on all three platforms, and needs no worklet round-trip to
 *     unmount afterwards. The Expo template version used Reanimated keyframes
 *     plus `scheduleOnRN` and needed a separate `.web.tsx` that returned null.
 *   - It does not render on web. The static build has already painted the page
 *     by the time JS runs, so an overlay there would be a flash of charcoal over
 *     content that was visible a moment ago — worse than no transition.
 *
 * `visible` is driven by the caller rather than a timer, so the mark stays up
 * for exactly as long as the stored session takes to read and not one frame
 * longer.
 */

import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';

import { Brand, Duration, Radius, Spacing, Type } from '@/constants/theme';

// Long enough to read as a transition, short enough that a warm start does not
// feel gated on it.
const FADE = Duration.slow;

type SplashOverlayProps = {
  /** While true the overlay covers the app. On the way to false it fades. */
  visible: boolean;
};

export function SplashOverlay({ visible }: SplashOverlayProps) {
  // `useState(...)` not `useRef(new Animated.Value())`: constructing it in a ref
  // initialiser allocates a value on every render and throws all but the first
  // away.
  const [opacity] = useState(() => new Animated.Value(1));
  const [mounted, setMounted] = useState(Platform.OS !== 'web');
  const hidden = useRef(false);

  useEffect(() => {
    if (!mounted || visible) {
      return;
    }

    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [mounted, visible, opacity]);

  // Hiding the native splash from a layout callback rather than an effect: the
  // callback fires once this view has actually been measured and drawn, so there
  // is never a frame where neither the splash nor the overlay is on screen.
  const onLayout = () => {
    if (hidden.current) {
      return;
    }
    hidden.current = true;
    // Swallowed on purpose. A failure here means the splash was already hidden,
    // which is not a problem worth surfacing to the user.
    SplashScreen.hideAsync().catch(() => {});
  };

  if (!mounted) {
    return null;
  }

  return (
    <Animated.View
      onLayout={onLayout}
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.overlay, { opacity }]}
    >
      <View style={styles.mark}>
        <Text style={styles.markLetter}>E</Text>
      </View>
      <Text style={styles.wordmark}>Edgewise</Text>
      <Text style={styles.tagline}>Know your edge. Watch your head.</Text>
    </Animated.View>
  );
}

// Fixed brand colours, not theme tokens: this has to match the one
// `splash.backgroundColor` in app.json, which cannot vary by scheme.
const styles = StyleSheet.create({
  overlay: {
    // `absoluteFillObject`, not `absoluteFill` — the latter is a registered
    // style ID (a number), so spreading it into an object yields nothing and
    // leaves the overlay with no positioning at all.
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Brand.charcoal,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    zIndex: 1000,
  },
  mark: {
    width: 76,
    height: 76,
    borderRadius: Radius.xl,
    backgroundColor: Brand.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markLetter: {
    ...Type.display,
    color: Brand.white,
  },
  wordmark: {
    ...Type.title,
    color: '#E6EEE9',
  },
  tagline: {
    ...Type.caption,
    color: '#93A79B',
    marginTop: -Spacing.two,
  },
});
