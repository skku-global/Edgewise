import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import { ease, native } from './theme';

export function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduce)
      .catch(() => {});
  }, []);
  return reduce;
}

export function Rise({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: reduce ? 250 : 700,
      delay,
      easing: ease,
      useNativeDriver: native,
    }).start();
  }, [reduce]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : 16, 0] });
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>
  );
}

export function useLoop(duration: number, pingPong = false) {
  const v = useRef(new Animated.Value(0)).current;
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const up = Animated.timing(v, {
      toValue: 1,
      duration,
      easing: pingPong ? Easing.inOut(Easing.ease) : Easing.linear,
      useNativeDriver: native,
    });
    const down = Animated.timing(v, {
      toValue: 0,
      duration,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: native,
    });
    const loop = Animated.loop(pingPong ? Animated.sequence([up, down]) : up);
    loop.start();
    return () => loop.stop();
  }, [reduce]);
  return v;
}
