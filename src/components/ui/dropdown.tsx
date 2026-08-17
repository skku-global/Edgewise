/**
 * Modal-backed select, used for the Add Trade setup field and both trades-table
 * filters.
 *
 * Hand-rolled rather than `@react-native-picker/picker`: it avoids another
 * native module (which would also mean another dev-build dependency), behaves
 * identically on web and native, and keeps the locked palette under our
 * control instead of inheriting platform chrome.
 */

import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/styles';

export type DropdownOption = {
  label: string;
  value: string | null;
};

type DropdownProps = {
  label?: string;
  value: string | null;
  options: DropdownOption[];
  onChange: (value: string | null) => void;
  /** Shown when `value` matches no option — e.g. an empty setup field. */
  placeholder?: string;
  /** Renders the compact pill used by the filter row. */
  compact?: boolean;
  testID?: string;
};

export function Dropdown({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  compact = false,
  testID,
}: DropdownProps) {
  const styles = useThemedStyles(sheet);
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value);

  return (
    <View style={compact ? styles.compactGroup : styles.group}>
      {label ? <ThemedText variant="label">{label}</ThemedText> : null}

      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          compact ? styles.compactTrigger : styles.trigger,
          pressed && styles.pressed,
        ]}
      >
        <ThemedText
          variant={selected ? 'bodyStrong' : 'body'}
          tone={selected ? 'text' : 'textTertiary'}
          numberOfLines={1}
          style={styles.triggerText}
        >
          {selected?.label ?? placeholder}
        </ThemedText>
        <ThemedText variant="caption" tone="textTertiary">
          ▾
        </ThemedText>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        {/* Backdrop press closes, matching the platform expectation for a
            lightweight picker. */}
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {label ? <ThemedText variant="heading">{label}</ThemedText> : null}

            <ScrollView bounces={false} style={styles.optionList}>
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <Pressable
                    key={option.value ?? '__all__'}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      active && styles.optionActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <ThemedText
                      variant={active ? 'bodyStrong' : 'body'}
                      tone={active ? 'accentText' : 'text'}
                    >
                      {option.label}
                    </ThemedText>
                    {active ? (
                      <ThemedText variant="bodyStrong" tone="accentText">
                        ✓
                      </ThemedText>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    group: {
      gap: t.space.one,
    },
    compactGroup: {
      flex: 1,
    },
    trigger: {
      borderWidth: 1,
      borderColor: t.color.borderStrong,
      borderRadius: t.radius.md,
      paddingHorizontal: t.space.three,
      paddingVertical: 10,
      backgroundColor: t.color.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.one,
    },
    compactTrigger: {
      borderWidth: 1,
      borderColor: t.color.borderStrong,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space.three,
      paddingVertical: t.space.two,
      backgroundColor: t.color.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.one,
    },
    triggerText: {
      flexShrink: 1,
    },
    pressed: {
      opacity: 0.7,
    },
    backdrop: {
      flex: 1,
      backgroundColor: t.color.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      padding: t.space.four,
    },
    sheet: {
      backgroundColor: t.color.surfaceRaised,
      borderRadius: t.radius.xl,
      borderWidth: 1,
      borderColor: t.color.border,
      padding: t.space.three,
      gap: t.space.two,
      width: '100%',
      maxWidth: 420,
      maxHeight: '70%',
      ...t.elevation[3],
    },
    optionList: {
      flexGrow: 0,
    },
    option: {
      paddingVertical: 10,
      paddingHorizontal: t.space.two,
      borderRadius: t.radius.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    optionActive: {
      backgroundColor: t.color.accentSoft,
    },
  });
