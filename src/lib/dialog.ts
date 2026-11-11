/**
 * Confirmation that works on every platform the app ships to.
 *
 * `Alert.alert` is a no-op on react-native-web: the module exists so imports
 * resolve, but calling it shows nothing and never fires a button handler. The
 * Chat screen's "Clear history" asked for confirmation through it, so on the
 * web — where this app is mostly used — the button did nothing at all, with no
 * error to explain why. Saved/failed notices in the trade sheet went the same
 * way. Inline notices replace those; this helper covers the one case that is
 * genuinely a yes/no question.
 */

import { Alert, Platform } from 'react-native';

export type ConfirmOptions = {
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export function confirmAsync(
  title: string,
  message: string,
  { confirmLabel = 'OK', cancelLabel = 'Cancel', destructive = false }: ConfirmOptions = {},
): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
      return Promise.resolve(false);
    }
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
