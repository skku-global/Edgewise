/**
 * Screen scaffold.
 *
 * Every screen in the app repeated the same four-layer arrangement —
 * background, safe area, max-width column, scroll view with the tab insets
 * added by hand — and each one drifted a little in its padding. This owns it
 * once.
 *
 * The two insets are not decoration. `BottomTabInset` clears the native tab bar,
 * which floats over content rather than pushing it up; `WebTopNavInset` clears
 * the absolutely-positioned web nav in app-tabs.web.tsx. Whichever platform is
 * running, the other is 0.
 */

import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, WebTopNavInset, type Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemedStyles } from '@/lib/styles';

export type ScreenProps = {
  children: React.ReactNode;
  /** Wires up pull-to-refresh. Omit for a screen with nothing to reload. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /**
   * Renders children in a plain View instead of a ScrollView. For a screen that
   * owns its own scrolling — a FlatList, or a chat log pinned to the bottom.
   */
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  contentStyle,
}: ScreenProps) {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, contentStyle]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            // Defaults to the platform grey, which reads as a system control
            // dropped into the app rather than part of it.
            tintColor={theme.color.accent}
            colors={[theme.color.accent]}
            progressBackgroundColor={theme.color.surface}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
  );

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {body}
      </SafeAreaView>
    </View>
  );
}

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  /** Rendered at the right end of the title row — an account button, a filter. */
  action?: React.ReactNode;
};

/**
 * The dark banner at the top of a screen.
 *
 * In light mode it inverts the page, which is what gives the app its identity at
 * a glance. In dark mode `hero` lifts instead of inverting — see the token
 * comment — so the same component still reads as a header rather than a hole.
 */
export function ScreenHeader({ title, subtitle, action }: ScreenHeaderProps) {
  const styles = useThemedStyles(sheet);

  return (
    <View style={styles.hero}>
      <View style={styles.heroRow}>
        <View style={styles.heroText}>
          <ThemedText variant="title" tone="heroText">
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText variant="body" tone="heroMuted">
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        {action}
      </View>
    </View>
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
      paddingHorizontal: t.space.four,
      // Centred column with a ceiling, so the app is readable on a desktop
      // browser instead of stretching one card across 2000px.
      maxWidth: MaxContentWidth,
      alignSelf: 'center',
      width: '100%',
    },
    content: {
      paddingTop: WebTopNavInset + t.space.three,
      paddingBottom: BottomTabInset + t.space.four,
      gap: t.space.three,
    },
    fill: {
      flex: 1,
    },
    hero: {
      backgroundColor: t.color.hero,
      borderRadius: t.radius.xl,
      paddingHorizontal: t.space.four,
      paddingVertical: t.space.four,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: t.space.three,
    },
    heroText: {
      flexShrink: 1,
      gap: t.space.one,
    },
  });
