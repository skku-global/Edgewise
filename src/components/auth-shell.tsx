/**
 * The frame every auth screen sits in.
 *
 * Sign in, forgot password and reset password are three routes with one
 * appearance: charcoal page, two soft glows, a card centred in the viewport, and
 * a pitch panel beside it once there is room. Written out per screen that would
 * be roughly a hundred and forty lines of layout copied three times, and the
 * copies would drift — the reset-password screen arrives by email link, which is
 * the one nobody opens while adjusting spacing.
 *
 * So the chrome lives here and the screens supply only what goes inside the
 * card. `aside` is the one axis of variation: the login screen wants the pitch
 * panel because it is the front door, while the two recovery screens are places
 * you land mid-task and a sales panel beside them would be noise.
 *
 * The card's own branding follows from that. With the panel showing, the mark is
 * already on the page and repeating it is clutter; without it, the card is all
 * there is and needs to say what app this is — which matters most on the reset
 * screen, reached from an email, where "which app was this?" is a real question.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthBackdrop } from '@/components/auth-backdrop';
import { BrandMark } from '@/components/brand-mark';
import { ThemedText } from '@/components/themed-text';
import { Brand, type Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemedStyles } from '@/lib/styles';

/**
 * Width at which the pitch panel appears. Chosen from the content, not from a
 * device: 420 card + 64 gap + ~400 of readable panel. Below it the panel would
 * be a column of wrapped two-word lines.
 */
export const AuthTwoColumnWidth = 920;

export const AuthCardWidth = 420;

const pitch = [
  {
    icon: 'create-outline',
    title: 'Journal in seconds',
    body: 'Log a trade with the numbers that matter and nothing that does not.',
  },
  {
    icon: 'pulse-outline',
    title: 'See your own patterns',
    body: 'Mood, conviction and restlessness recorded next to the P/L they produced.',
  },
  {
    icon: 'sync-outline',
    title: 'Straight from MetaTrader',
    body: 'Closed positions sync themselves, so the journal is never a week behind.',
  },
] as const;

export type AuthShellProps = {
  /** Show the pitch panel once the window is wide enough. Login only. */
  aside?: boolean;
  children: React.ReactNode;
};

export function AuthShell({ aside = false, children }: AuthShellProps) {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);
  const { width } = useWindowDimensions();

  const twoColumn = aside && width >= AuthTwoColumnWidth;

  // Entrance. Opacity and translate only, so it runs on the native driver and is
  // not competing with the session restore that happens on the same frame.
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: theme.duration.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, theme.duration.slow]);

  return (
    <View style={styles.page}>
      <AuthBackdrop />

      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.safe}
          // Web has no software keyboard to avoid, and 'padding' there fights
          // the centring instead.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.scroll, twoColumn && styles.scrollWide]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={[
                twoColumn ? styles.columns : styles.single,
                {
                  opacity: enter,
                  transform: [
                    { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
                  ],
                },
              ]}
            >
              {twoColumn ? (
                <View style={styles.pitch}>
                  <BrandMark size={52} />

                  <View style={styles.pitchHead}>
                    <ThemedText variant="display" tone="heroText">
                      Edgewise
                    </ThemedText>
                    <ThemedText variant="body" tone="heroMuted" style={styles.pitchTagline}>
                      Know your edge. Watch your head.
                    </ThemedText>
                  </View>

                  <View style={styles.pitchList}>
                    {pitch.map((item) => (
                      <View key={item.title} style={styles.pitchRow}>
                        <View style={styles.pitchIcon}>
                          <Ionicons name={item.icon} size={18} color={Brand.greenBright} />
                        </View>
                        <View style={styles.pitchCopy}>
                          <ThemedText variant="subheading" tone="heroText">
                            {item.title}
                          </ThemedText>
                          <ThemedText variant="caption" tone="heroMuted">
                            {item.body}
                          </ThemedText>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.card}>
                {twoColumn ? null : (
                  <View style={styles.cardBrand}>
                    <BrandMark size={44} />
                    <ThemedText variant="title">Edgewise</ThemedText>
                  </View>
                )}

                {children}
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: t.color.hero,
    },
    safe: {
      flex: 1,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: t.space.four,
    },
    scrollWide: {
      padding: t.space.five,
    },
    single: {
      width: '100%',
      maxWidth: AuthCardWidth,
    },
    columns: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.six,
      // 420 card + 64 gap + 400 panel. Wider than this and the two halves stop
      // reading as one composition.
      maxWidth: 884,
    },
    pitch: {
      flex: 1,
      gap: t.space.four,
    },
    pitchHead: {
      gap: t.space.two,
    },
    pitchTagline: {
      maxWidth: 340,
    },
    pitchList: {
      gap: t.space.three,
    },
    pitchRow: {
      flexDirection: 'row',
      gap: t.space.three,
      alignItems: 'flex-start',
    },
    // Translucent bright green rather than a token: this tile sits on `hero`,
    // which is charcoal in both schemes, so it needs one fixed value that works
    // on charcoal — `accentSoft` is built for the page background instead.
    pitchIcon: {
      width: 36,
      height: 36,
      borderRadius: t.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(78, 203, 141, 0.14)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(78, 203, 141, 0.24)',
    },
    pitchCopy: {
      flex: 1,
      gap: t.space.half,
    },
    card: {
      width: '100%',
      maxWidth: AuthCardWidth,
      padding: t.space.four,
      gap: t.space.four,
      borderRadius: t.radius.xl,
      backgroundColor: t.color.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.border,
      ...t.elevation[3],
    },
    cardBrand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.three,
    },
  });
