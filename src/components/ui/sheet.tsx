/**
 * Full-screen sheet.
 *
 * All three of the app's modals — trade detail, add trade, tag trades — had
 * their own copy of the same arrangement: a `Modal`, a safe area, a header with
 * a pill-shaped Close button, and a scroll view with bottom padding. They had
 * drifted apart in padding, corner radius and close-button size. This owns it.
 *
 * `animationType="slide"` and an opaque background rather than a transparent
 * partial-height sheet: on Android a transparent modal does not draw under the
 * status bar, so a partial sheet leaves a pale strip at the top in dark mode.
 * A full-screen opaque sheet looks the same on both platforms.
 *
 * `onRequestClose` is what makes the Android back button and the web Escape key
 * dismiss the sheet. Leaving it off traps the user in the modal on Android.
 */

import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, type Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/styles';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /**
   * Pinned below the scroll area — for a primary action that must stay reachable
   * with the keyboard up and the form scrolled.
   */
  footer?: React.ReactNode;
};

export function Sheet({ visible, onClose, title, subtitle, children, footer }: SheetProps) {
  const styles = useThemedStyles(sheet);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <ThemedText variant="title" numberOfLines={1}>
                {title}
              </ThemedText>
              {subtitle ? (
                <ThemedText variant="body" tone="textSecondary">
                  {subtitle}
                </ThemedText>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={12}
              style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
            >
              <ThemedText variant="label" tone="textSecondary">
                Close
              </ThemedText>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: t.color.bg,
    },
    safeArea: {
      flex: 1,
      width: '100%',
      maxWidth: MaxContentWidth,
      alignSelf: 'center',
      paddingHorizontal: t.space.four,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: t.space.two,
      paddingTop: t.space.three,
      paddingBottom: t.space.three,
    },
    headerText: {
      flexShrink: 1,
      gap: t.space.half,
    },
    close: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.borderStrong,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space.three,
      paddingVertical: t.space.two,
    },
    closePressed: {
      backgroundColor: t.color.surfaceActive,
    },
    content: {
      gap: t.space.three,
      paddingBottom: t.space.five,
    },
    footer: {
      paddingVertical: t.space.three,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.color.border,
      gap: t.space.two,
    },
  });
