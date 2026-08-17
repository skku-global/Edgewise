/**
 * The three states that are not "here is your data": loading, failed, empty.
 *
 * They live together because they are the same box — a card of the same height,
 * so the screen does not jump as it resolves from one to the next — and because
 * a screen that handles two of the three is the usual way an app ships a blank
 * page with no explanation.
 */

import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemedStyles } from '@/lib/styles';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);

  return (
    <Card style={styles.box}>
      <ActivityIndicator color={theme.color.accent} />
      <ThemedText variant="caption" tone="textTertiary">
        {label}
      </ThemedText>
    </Card>
  );
}

export type ErrorStateProps = {
  message: string;
  onRetry?: () => void;
};

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const styles = useThemedStyles(sheet);

  return (
    <Card style={[styles.box, styles.error]}>
      <ThemedText variant="subheading" tone="loss">
        Something went wrong
      </ThemedText>
      <ThemedText variant="body" tone="textSecondary" style={styles.centered}>
        {message}
      </ThemedText>
      {onRetry ? <Button label="Try again" variant="secondary" size="sm" onPress={onRetry} /> : null}
    </Card>
  );
}

export type EmptyStateProps = {
  title: string;
  body: string;
  action?: React.ReactNode;
};

export function EmptyState({ title, body, action }: EmptyStateProps) {
  const styles = useThemedStyles(sheet);

  return (
    <Card style={styles.box}>
      <View style={styles.copy}>
        <ThemedText variant="heading">{title}</ThemedText>
        <ThemedText variant="body" tone="textSecondary" style={styles.centered}>
          {body}
        </ThemedText>
      </View>
      {action}
    </Card>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    box: {
      minHeight: 148,
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.space.three,
      paddingVertical: t.space.four,
    },
    error: {
      borderColor: t.color.loss,
      backgroundColor: t.color.lossSoft,
    },
    copy: {
      alignItems: 'center',
      gap: t.space.one,
    },
    centered: {
      textAlign: 'center',
      maxWidth: 320,
    },
  });
