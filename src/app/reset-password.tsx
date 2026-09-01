/**
 * Reset password — step two of two.
 *
 * Only reachable while `isRecovering` is true, which is set by `lib/session.tsx`
 * when a recovery link is opened. The root layout makes this the *only* screen
 * available in that state, so there is no navigation call anywhere in this file:
 * the guard put the user here and clearing the flag is what lets them leave.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ACTUALLY HAPPENING WHEN THIS SCREEN OPENS
 * ---------------------------------------------------------------------------
 * The recovery link did not open a "reset mode" — it signed the user in. This
 * screen is standing in front of a real session, and `updateUser` works because
 * of that session, not because of anything in the URL. Two things follow:
 *
 *   - Nothing asks for the old password. There is nothing to check it against;
 *     possession of the emailed link *is* the proof, which is why those links
 *     expire quickly and are single-use.
 *   - Leaving without setting a password would drop the user into the app with
 *     their old one intact. `endRecovery` is therefore only called from the two
 *     endings that make sense — a password was set, or the link was no good and
 *     they are going back to ask for another.
 *
 * The confirm field is not ceremony. The password is masked, this is the only
 * chance to type it, and a typo here locks someone out of their own account with
 * no way to discover what they actually entered.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { ThemedText } from '@/components/themed-text';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MinPasswordLength, passwordStrength } from '@/lib/credentials';
import { useSession } from '@/lib/session';
import { useThemedStyles } from '@/lib/styles';

export default function ResetPasswordScreen() {
  const { updatePassword, endRecovery, linkError, clearLinkError, user, backendError } =
    useSession();
  const theme = useTheme();
  const styles = useThemedStyles(sheet);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const passwordInput = useRef<TextInput>(null);
  const confirmInput = useRef<TextInput>(null);

  // Shown in place of a form error, not as its own screen. The "that link did
  // not work" state below would be a lie here: a refused link is Supabase
  // answering, and this is Supabase not answering at all. The form stays live —
  // submitting it just reports the same thing a second time.
  const error = backendError ?? formError;

  const strength = useMemo(() => passwordStrength(password), [password]);

  const dismissLinkError = () => {
    clearLinkError();
    endRecovery();
  };

  const submit = async () => {
    if (submitting) return;

    setFormError(null);

    let bad = false;

    if (password.length < MinPasswordLength) {
      setPasswordError(
        password ? `At least ${MinPasswordLength} characters.` : 'Choose a new password.',
      );
      bad = true;
    } else {
      setPasswordError(null);
    }

    if (!bad && confirm !== password) {
      setConfirmError('These do not match.');
      bad = true;
    } else if (!bad) {
      setConfirmError(null);
    }

    if (bad) {
      (password.length < MinPasswordLength ? passwordInput : confirmInput).current?.focus();
      return;
    }

    setSubmitting(true);

    try {
      const result = await updatePassword(password);

      if (result.error) {
        setFormError(result.error);
        return;
      }

      // Deliberately not calling `endRecovery` yet. Being dropped into the
      // dashboard the instant the request returns leaves no confirmation that
      // the password actually changed — which is the one thing the person came
      // here to find out.
      setDone(true);
      setPassword('');
      setConfirm('');
    } finally {
      setSubmitting(false);
    }
  };

  // The link was opened but Supabase refused it — expired, or already used. The
  // only way forward is a fresh one, so say so and get out of recovery mode,
  // which returns the user to the sign-in screen.
  if (linkError) {
    return (
      <AuthShell>
        <View style={styles.head}>
          <ThemedText variant="heading">That link did not work</ThemedText>
          <ThemedText variant="caption" tone="textSecondary">
            Recovery links expire quickly and can only be used once.
          </ThemedText>
        </View>

        <Banner tone="error" message={linkError} />

        <Button label="Request a new link" size="lg" block onPress={dismissLinkError} />
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell>
        <View style={styles.head}>
          <ThemedText variant="heading">Password changed</ThemedText>
          <ThemedText variant="caption" tone="textSecondary">
            You are signed in on this device. Use the new password next time.
          </ThemedText>
        </View>

        <Banner
          tone="success"
          message="Your password has been updated. Any other device stays signed in until its session expires."
        />

        <Button label="Continue to Edgewise" size="lg" block onPress={endRecovery} />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <View style={styles.head}>
        <ThemedText variant="heading">Choose a new password</ThemedText>
        <ThemedText variant="caption" tone="textSecondary">
          {user?.email
            ? `For ${user.email}. Pick something you have not used here before.`
            : 'Pick something you have not used here before.'}
        </ThemedText>
      </View>

      {error ? <Banner tone="error" message={error} /> : null}

      <View style={styles.form}>
        <View>
          <Field
            ref={passwordInput}
            label="New password"
            placeholder={`${MinPasswordLength} characters or more`}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (passwordError) setPasswordError(null);
              if (formError) setFormError(null);
            }}
            error={passwordError ?? undefined}
            secureTextEntry={!revealed}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmInput.current?.focus()}
            editable={!submitting}
            autoFocus
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

          {password.length > 0 ? (
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

        <Field
          ref={confirmInput}
          label="Confirm new password"
          placeholder="Type it again"
          value={confirm}
          onChangeText={(value) => {
            setConfirm(value);
            if (confirmError) setConfirmError(null);
            if (formError) setFormError(null);
          }}
          error={confirmError ?? undefined}
          secureTextEntry={!revealed}
          autoCapitalize="none"
          autoCorrect={false}
          // `new-password` on both, so a password manager understands this is one
          // credential being set rather than two separate fields to fill.
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
          editable={!submitting}
        />
      </View>

      <Button label="Set new password" size="lg" block loading={submitting} onPress={submit} />

      <View style={styles.footer}>
        {/* Skipping does not sign anyone out: the recovery link produced a real
            session, and having reached the inbox on this account is the same
            proof of identity a sign-in would have given. So this continues into
            the app with the old password still in place — which the label has to
            say plainly, or it reads as "go back". */}
        <Pressable accessibilityRole="button" hitSlop={8} onPress={endRecovery}>
          <ThemedText variant="caption" tone="textTertiary">
            Keep my current password and continue
          </ThemedText>
        </Pressable>
      </View>
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
    strengthStepOn: {
      backgroundColor: t.color.gain,
    },
    strengthWeak: {
      backgroundColor: t.color.loss,
    },
    strengthFair: {
      backgroundColor: t.color.neutral,
    },
    footer: {
      alignItems: 'center',
    },
  });
