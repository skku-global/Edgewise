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
 * `supabase` import here at all. The page chrome comes from `AuthShell`, shared
 * with the two password-recovery screens.
 *
 * ---------------------------------------------------------------------------
 * WHERE SIGN-UP ENDS
 * ---------------------------------------------------------------------------
 * With email confirmation on, creating an account produces no session — so
 * there is nowhere to navigate and the form has done its job. Staying on the
 * sign-up tab at that point is wrong: the fields are filled in, the button still
 * says "Create account", and the obvious reading is that nothing happened.
 *
 * So a successful sign-up flips to the sign-in tab and carries the notice with
 * it. The next step is now the visible one — confirm the email, then sign in
 * with the form already in front of you.
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
 *   - An unconfirmed-email sign-in offers to resend the link. That error is the
 *     only one the app can act on for the user, and without the button the
 *     advice ("check your inbox") is useless to anyone whose email never
 *     arrived.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { ThemedText } from '@/components/themed-text';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Reveal } from '@/components/ui/reveal';
import { Segmented } from '@/components/ui/segmented';
import type { Theme } from '@/constants/theme';
import { useCooldown } from '@/hooks/use-cooldown';
import { useTheme } from '@/hooks/use-theme';
import { MinPasswordLength, isEmailish, passwordStrength } from '@/lib/credentials';
import { UnconfirmedEmailError, useSession } from '@/lib/session';
import { useThemedStyles } from '@/lib/styles';

type Mode = 'signIn' | 'signUp';
type FieldName = 'firstName' | 'lastName' | 'email' | 'password';
type FieldErrors = Partial<Record<FieldName, string>>;

/** Tab order, which is also the order errors are reported in. */
const FocusOrder: FieldName[] = ['firstName', 'lastName', 'email', 'password'];

/** Seconds before "resend" is offered again. Comfortably inside Supabase's own. */
const ResendCooldown = 45;

const modes: { value: Mode; label: string }[] = [
  { value: 'signIn', label: 'Sign in' },
  { value: 'signUp', label: 'Create account' },
];

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
  const { signIn, signUp, resendConfirmation, linkError, clearLinkError } = useSession();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(sheet);

  const [mode, setMode] = useState<Mode>('signIn');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  /** Whatever came back from Supabase, or a problem with the form as a whole. */
  const [formError, setFormError] = useState<string | null>(null);
  /** Success that is not a session — currently only "confirm your email". */
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  /**
   * There is an unconfirmed account for this address. Set from two directions —
   * a fresh sign-up, and a sign-in refused for the same reason — because both
   * end with the same person waiting on the same email.
   */
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const isSignUp = mode === 'signUp';
  const cooldown = useCooldown(ResendCooldown);

  const inputs: Record<FieldName, React.RefObject<TextInput | null>> = {
    firstName: useRef<TextInput>(null),
    lastName: useRef<TextInput>(null),
    email: useRef<TextInput>(null),
    password: useRef<TextInput>(null),
  };

  const strength = useMemo(() => passwordStrength(password), [password]);

  // A dead email link lands here, because the guards send a session-less user to
  // this screen. It outranks a form error: it explains why they are looking at a
  // sign-in page they did not ask for.
  const error = linkError ?? formError;

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    // Errors belong to the form that produced them. A "password too short"
    // carried over to sign-in would be wrong — sign-in has no length rule.
    setFieldErrors({});
    setFormError(null);
    setNotice(null);
    setAwaitingConfirmation(false);
    clearLinkError();
  };

  /** Clears a field's error as soon as the person starts fixing it. */
  const change = (name: FieldName, setter: (value: string) => void) => (value: string) => {
    setter(value);
    if (fieldErrors[name]) {
      setFieldErrors((previous) => ({ ...previous, [name]: undefined }));
    }
    if (formError) setFormError(null);
    if (linkError) clearLinkError();
  };

  const resend = async () => {
    if (resending || cooldown.active) return;

    setResending(true);
    setFormError(null);

    try {
      const result = await resendConfirmation(email);

      if (result.error) {
        setFormError(result.error);
        return;
      }

      setNotice(result.message ?? null);
      cooldown.start();
    } finally {
      setResending(false);
    }
  };

  const submit = async () => {
    if (submitting) return;

    const errors = validate(mode, { firstName, lastName, email, password });
    setFieldErrors(errors);
    setFormError(null);
    setNotice(null);
    clearLinkError();

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
        setAwaitingConfirmation(result.error === UnconfirmedEmailError);
        return;
      }

      if (result.message) {
        // Signed up, but confirmation is on: there is no session to route to.
        // Move to sign-in — that is the next thing to do once the link is
        // clicked — and keep the email in place so the form is already filled.
        setMode('signIn');
        setNotice(result.message);
        setAwaitingConfirmation(true);
        setPassword('');
        setRevealed(false);
        setFieldErrors({});
        cooldown.start();
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

  const resendButton = (
    <Button
      label={
        cooldown.active ? `Resend in ${cooldown.remaining}s` : 'Resend confirmation email'
      }
      variant="secondary"
      size="sm"
      loading={resending}
      disabled={cooldown.active}
      onPress={resend}
    />
  );

  return (
    <AuthShell aside>
      <Segmented options={modes} value={mode} onChange={switchMode} disabled={submitting} />

      <View style={styles.head}>
        <ThemedText variant="heading">
          {isSignUp ? 'Start your journal' : 'Welcome back'}
        </ThemedText>
        <ThemedText variant="caption" tone="textSecondary">
          {isSignUp
            ? 'A minute to set up. Your trades and your notes stay together after that.'
            : 'Pick up where you left off.'}
        </ThemedText>
      </View>

      {error ? (
        <Banner
          tone="error"
          message={error}
          action={
            awaitingConfirmation ? (
              resendButton
            ) : linkError ? (
              <Button
                label="Request a new link"
                variant="secondary"
                size="sm"
                onPress={() => {
                  clearLinkError();
                  router.push('/forgot-password');
                }}
              />
            ) : null
          }
        />
      ) : null}

      {notice ? (
        <Banner
          tone="notice"
          message={notice}
          action={awaitingConfirmation ? resendButton : null}
        />
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
            // Telling the manager which of the two this is decides whether it
            // offers to fill or to generate.
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

          {/* Sign-up only. On sign-in the password is already chosen and rating
              it would be commentary, not help. */}
          {isSignUp && password.length > 0 ? (
            <View style={styles.strength}>
              <View style={styles.strengthTrack}>
                {[1, 2, 3].map((step) => (
                  <View
                    key={step}
                    style={[
                      styles.strengthStep,
                      strength.score >= step && styles.strengthStepOn,
                      strength.score >= step && strength.score === 1 && styles.strengthWeak,
                      strength.score >= step && strength.score === 2 && styles.strengthFair,
                    ]}
                  />
                ))}
              </View>
              <ThemedText
                variant="caption"
                tone={
                  strength.score === 3 ? 'gain' : strength.score === 1 ? 'loss' : 'textSecondary'
                }
              >
                {strength.label}
              </ThemedText>
            </View>
          ) : null}
        </View>

        {/* Sign-in only: on sign-up there is no password to have forgotten. */}
        {isSignUp ? null : (
          <View style={styles.forgotRow}>
            <Link href="/forgot-password" asChild>
              <Pressable accessibilityRole="link" hitSlop={8}>
                <ThemedText variant="caption" tone="accentText">
                  Forgot your password?
                </ThemedText>
              </Pressable>
            </Link>
          </View>
        )}
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
    </AuthShell>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    head: {
      gap: t.space.one,
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
    // Base "filled" is the strong state; the two below override it. Ordered this
    // way so a strong password needs no extra style at all.
    strengthStepOn: {
      backgroundColor: t.color.gain,
    },
    strengthWeak: {
      backgroundColor: t.color.loss,
    },
    strengthFair: {
      backgroundColor: t.color.neutral,
    },
    forgotRow: {
      alignItems: 'flex-end',
    },
    footnote: {
      textAlign: 'center',
    },
  });
