/**
 * Which design is showing: the white one or the dark one.
 *
 * A tiny shared store, so no provider has to be added to the app. Anything that
 * calls `useDesignMode()` (or `useTheme()`, which reads it) re-renders when the
 * mode changes. The choice is remembered on this device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export type DesignMode = 'white' | 'dark';

const KEY = 'edgewise.design.v1';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function initialMode(): DesignMode {
  // The web can read its saved choice straight away, so there is no flash.
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      if (window.localStorage.getItem(KEY) === 'dark') {
        return 'dark';
      }
    } catch {
      // storage blocked: fall back to white
    }
  }
  return 'white';
}

let mode: DesignMode = initialMode();

// Phones read it asynchronously, right after start.
if (Platform.OS !== 'web') {
  AsyncStorage.getItem(KEY)
    .then((saved) => {
      if (saved === 'dark' && mode !== 'dark') {
        mode = 'dark';
        emit();
      }
    })
    .catch(() => undefined);
}

export function setDesignMode(next: DesignMode): void {
  if (next === mode) {
    return;
  }
  mode = next;
  emit();
  AsyncStorage.setItem(KEY, next).catch(() => undefined);
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function useDesignMode(): { mode: DesignMode; setMode: (m: DesignMode) => void; toggle: () => void } {
  const current = useSyncExternalStore(subscribe, () => mode, () => 'white' as DesignMode);
  return {
    mode: current,
    setMode: setDesignMode,
    toggle: () => setDesignMode(current === 'dark' ? 'white' : 'dark'),
  };
}
