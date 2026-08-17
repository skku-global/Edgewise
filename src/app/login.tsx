/**
 * Sign in / sign up.
 *
 * One screen for both, because the fields are the same bar two and a second
 * route would double the layout work for no gain. `mode` drives the copy, the
 * validation and which verb runs.
 *
 * All the auth logic lives in `lib/session.tsx` — this screen only collects
 * input and renders what came back. That is what keeps the Supabase error
 * mapping in one place instead of per screen, and it is why there is no
 * `supabase` import here at all.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE LAYOUT IS DOING
 * ---------------------------------------------------------------------------
 * Below 920pt it is a single centred card. At and above, a pitch panel appears
 * to its left. The panel is not decoration: this is the first screen anyone
 * sees, including the clients this project is shown to, and a bare form on a
 * dark page says nothing about what the app is for. On a phone that panel would
 * push the form below the fold, so it is simply not rendered there — the
 * heading carries the same job in one line.
 *
 * ---------------------------------------------------------------------------
 * THINGS THAT LOOK LIKE POLISH BUT ARE CORRECTNESS
 * ---------------------------------------------------------------------------
 *   - `autoComplete` / `textContentType` on every field. Without them a
 *     password manager cannot fill the form and iOS will not offer to save the
 *     credentials, which is the difference between an app people sign into and
 *     one they give up on.
 *   - Errors land under the field that caused them, and submitting an invalid
 *     form moves focus to the first offender. A single banner at the top makes
 *     the reader hunt for which of four inputs it meant.
 *   - `returnKeyType` chains the fields, so the whole form is fillable from the
 *     keyboard without reaching for the screen between each one.
 *   - The name fields unmount on sign-in rather than being hidden, so Tab and a
 *     screen reader never reach a field the current mode has no use for.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthBackdrop } from '@/components/auth-backdrop';
import { BrandMark } from '@/components/brand-mark';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Reveal } from '@/components/ui/reveal';
import { Segmented } from '@/components/ui/segmented';
import { Brand, type Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MinPasswordLength, isEmailish, passwordStrength } from '@/lib/credentials';
import { useSession } from '@/lib/session';
import { useThemedStyles } from '@/lib/styles';

type Mode = 'signIn' | 'signUp';
type FieldName = 'firstName' | 'lastName' | 'email' | 'password';
type FieldErrors = Partial<Record<FieldName, string>>;

/**
 * Width at which the pitch panel appears. Chosen from the content, not from a
 * device: 420 card + 32 gap + ~400 of readable panel. Below it the panel would
 * be a column of wrapped two-word lines.
 */
const TwoColumnWidth = 920;

const CardWidth = 420;

/** Tab order, which is also the order errors are reported in. */
const FocusOrder: FieldName[] = ['firstName', 'lastName', 'email', 'password'];

const modes: { value: Mode; label: string }[] = [
  { value: 'signIn', label: 'Sign in' },
  { value: 'signUp', label: 'Create account' },
];

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

/**
 * Client-side checks only — the server is still the authority. The point is to
 * catch the mistakes that would otherwise cost a network round trip and come
 * back as a message written for a developer.
 */
function validate(mode: Mode, values: Record<FieldName, string>): FieldErrors {
  const errors: FieldErrors = {};

  if (mode === 'signUp') {
    if (!values.firstName.trim()) errors.firstName = 'Required.';
    if (!values.lastName.trim()) errors.lastName = 'Required.';
  }

  if (!values.email.trim()) {
    errors.email = 'Enter your email address.';
  } else if (!isEmailish(values.email)) {
    errors.email = 'That does not look like an email address.';
  }

  if (!values.password) {
    errors.password = 'Enter your password.';
  } else if (mode === 'signUp' && values.password.length < MinPasswordLength) {
    errors.password = `At least ${MinPasswordLength} characters.`;
  }

  return errors;
}

export default function LoginScreen() {
  const { signIn, signUp } = useSession();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(sheet);
  const { width } = useWindowDimensions();

  const [mode, setMode] = useState<Mode>('signIn');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Whatever came back from Supabase, or a problem with the form as a whole. */
  const [formError, setFormError] = useState<string | null>(null);
  /** Success that is not a session — currently only "confirm your email". */
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const isSignUp = mode === 'signUp';
  const twoColumn = width >= TwoColumnWidth;

  const inputs: Record<FieldName, React.RefObject<TextInput | null>> = {
    firstName: useRef<TextInput>(null),
    lastName: useRef<TextInput>(null),
    email: useRef<TextInput>(null),
    password: useRef<TextInput>(null),
  };

  const strength = useMemo(() => passwordStrength(password), [password]);

  // Entrance. Opacity and translate only, so it runs on the native driver and
  // is not competing with the session restore that happens on the same frame.
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: theme.duration.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, theme.duration.slow]);

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    // Errors belong to the form that produced them. A "password too short"
    // carried over to sign-in would be wrong — sign-in has no length rule.
    setFieldErrors({});
    setFormError(null);
    setNotice(null);
  };

  /** Clears a field's error as soon as the person starts fixing it. */
  const change = (name: FieldName, setter: (value: string) => void) => (value: string) => {
    setter(value);
    if (fieldErrors[name]) {
      setFieldErrors((previous) => ({ ...previous, [name]: undefined }));
    }
    if (formError) setFormError(null);
  };

  const submit = async () => {
    if (submitting) return;

    const errors = validate(mode, { firstName, lastName, email, password });
    setFieldErrors(errors);
    setFormError(null);
    setNotice(null);

    const firstInvalid = FocusOrder.find((name) => errors[name]);
    if (firstInvalid) {
      inputs[firstInvalid].current?.focus();
      return;
    }

    setSubmitting(true);

    try {
      const result = isSignUp
        ? await signUp({
            email: email.trim(),
            password,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
          })
        : await signIn(email.trim(), password);

      if (result.error) {
        setFormError(result.error);
        return;
      }

      if (result.message) {
        // Signed up, but confirmation is on: there is no session to route to.
        setNotice(result.message);
        setPassword('');
        return;
      }

      // The guard in _layout.tsx swaps the stack the moment the session lands,
      // so this only matters when the screen was reached by deep link while
      // already signed in.
      router.replace('/');
    } finally {
      setSubmitting(false);
    }
  };

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
                    {
                      translateY: enter.interpolate({
                        inputRange: [0, 1],
                        outputRange: [14, 0],
                      }),
                    },
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
                {/* On the narrow layout this is the only branding there is, so
                    it carries the mark. On the wide one the panel already has
                    it and repeating it would be noise. */}
                {twoColumn ? null : (
                  <View style={styles.cardBrand}>
                    <BrandMark size={44} />
                    <ThemedText variant="title">Edgewise</ThemedText>
                  </View>
                )}

                <Segmented
                  options={modes}
                  value={mode}
                  onChange={switchMode}
                  disabled={submitting}
                />

                <View style={styles.cardHead}>
                  <ThemedText variant="heading">
                    {isSignUp ? 'Start your journal' : 'Welcome back'}
                  </ThemedText>
                  <ThemedText variant="caption" tone="textSecondary">
                    {isSignUp
                      ? 'A minute to set up. Your trades and your notes stay together after that.'
                      : 'Pick up where you left off.'}
                  </ThemedText>
                </View>

                {formError ? (
                  <View style={[styles.banner, styles.bannerError]}>
                    <Ionicons name="alert-circle" size={18} color={theme.color.loss} />
                    <ThemedText variant="caption" tone="loss" style={styles.bannerText}>
                      {formError}
                    </ThemedText>
                  </View>
                ) : null}

                {notice ? (
                  <View style={[styles.banner, styles.bannerNotice]}>
                    <Ionicons name="mail-outline" size={18} color={theme.color.accentText} />
                    <ThemedText variant="caption" tone="accentText" style={styles.bannerText}>
                      {notice}
                    </ThemedText>
                  </View>
                ) : null}

                <View style={styles.form}>
                  <Reveal open={isSignUp}>
                    <View style={styles.nameRow}>
                      <Field
                        ref={inputs.firstName}
                        label="First name"
                        placeholder="Alex"
                        value={firstName}
                        onChangeText={change('firstName', setFirstName)}
                        error={fieldErrors.firstName}
                        autoCapitalize="words"
                        autoComplete="given-name"
                        textContentType="givenName"
                        returnKeyType="next"
                        onSubmitEditing={() => inputs.lastName.current?.focus()}
                        editable={!submitting}
                        containerStyle={styles.nameField}
                      />
                      <Field
                        ref={inputs.lastName}
                        label="Last name"
                        placeholder="Morgan"
                        value={lastName}
                        onChangeText={change('lastName', setLastName)}
                        error={fieldErrors.lastName}
                        autoCapitalize="words"
                        autoComplete="family-name"
                        textContentType="familyName"
                        returnKeyType="next"
                        onSubmitEditing={() => inputs.email.current?.focus()}
                        editable={!submitting}
                        containerStyle={styles.nameField}
                      />
                    </View>
                  </Reveal>

                  <Field
                    ref={inputs.email}
                    label="Email"
                    placeholder="you@example.com"
                    value={email}
                    onChangeText={change('email', setEmail)}
                    error={fieldErrors.email}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    onSubmitEditing={() => inputs.password.current?.focus()}
                    editable={!submitting}
                  />

                  <View>
                    <Field
                      ref={inputs.password}
                      label="Password"
                      placeholder={isSignUp ? `${MinPasswordLength} characters or more` : '••••••••'}
                      value={password}
                      onChangeText={change('password', setPassword)}
                      error={fieldErrors.password}
                      secureTextEntry={!revealed}
                      autoCapitalize="none"
                      autoCorrect={false}
                      // Telling the manager which of the two this is decides
                      // whether it offers to fill or to generate.
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                      textContentType={isSignUp ? 'newPassword' : 'password'}
                      returnKeyType="go"
                      onSubmitEditing={submit}
                      editable={!submitting}
                      trailing={
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
                          hitSlop={8}
                          onPress={() => setRevealed((value) => !value)}
                        >
                          <Ionicons
                            name={revealed ? 'eye-off-outline' : 'eye-outline'}
                            size={20}
                            color={theme.color.textTertiary}
                          />
                        </Pressable>
                      }
                    />

                    {/* Sign-up only. On sign-in the password is already chosen
                        and rating it would be commentary, not help. */}
                    {isSignUp && password.length > 0 ? (
                      <View style={styles.strength}>
                        <View style={styles.strengthTrack}>
                          {[1, 2, 3].map((step) => (
                            <View
                              key={step}
                              style={[
                                styles.strengthStep,
                                strength.score >= step && styles.strengthStepOn,
                                strength.score >= step &&
                                  strength.score === 1 &&
                                  styles.strengthWeak,
                                strength.score >= step &&
                                  strength.score === 2 &&
                                  styles.strengthFair,
                              ]}
                            />
                          ))}
                        </View>
                        <ThemedText
                          variant="caption"
                          tone={
                            strength.score === 3
                              ? 'gain'
                              : strength.score === 1
                                ? 'loss'
                                : 'textSecondary'
                          }
                        >
                          {strength.label}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                </View>

                <Button
                  label={isSignUp ? 'Create account' : 'Sign in'}
                  size="lg"
                  block
                  loading={submitting}
                  onPress={submit}
                />

                {isSignUp ? (
                  <ThemedText variant="caption" tone="textTertiary" style={styles.footnote}>
                    We will email you a confirmation link before your first sign in.
                  </ThemedText>
                ) : null}
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
      maxWidth: CardWidth,
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
      maxWidth: CardWidth,
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
    cardHead: {
      gap: t.space.one,
    },
    banner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: t.space.two,
      padding: t.space.three,
      borderRadius: t.radius.md,
    },
    bannerText: {
      flex: 1,
    },
    bannerError: {
      backgroundColor: t.color.lossSoft,
    },
    bannerNotice: {
      backgroundColor: t.color.accentSoft,
    },
    form: {
      gap: t.space.three,
    },
    nameRow: {
      flexDirection: 'row',
      gap: t.space.three,
      // Bottom padding inside the Reveal, so the gap below the row belongs to
      // the collapsing box and animates away with it.
      paddingBottom: t.space.three,
    },
    nameField: {
      flex: 1,
    },
    strength: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.two,
      paddingTop: t.space.two,
    },
    strengthTrack: {
      flexDirection: 'row',
      gap: t.space.one,
      flex: 1,
    },
    strengthStep: {
      flex: 1,
      height: 4,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.border,
    },
    // Base "filled" is the strong state; the two below override it. Ordered
    // this way so a strong password needs no extra style at all.
    strengthStepOn: {
      backgroundColor: t.color.gain,
    },
    strengthWeak: {
      backgroundColor: t.color.loss,
    },
    strengthFair: {
      backgroundColor: t.color.neutral,
    },
    footnote: {
      textAlign: 'center',
    },
  });
