/**
 * Forgot password — step one of two.
 *
 * Collects an address and asks Supabase to email a recovery link. The link lands
 * on `reset-password`, which is step two.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SUCCESS MESSAGE IS VAGUE
 * ---------------------------------------------------------------------------
 * `resetPasswordForEmail` returns success whether or not the address has an
 * account, and that is deliberate on Supabase's part: an endpoint that answered
 * honestly would let anyone check which email addresses are registered here, one
 * request at a time. "If an account exists for that address…" is the only honest
 * thing this screen can say, and saying it plainly is better than a confident
 * "sent!" that may be false.
 *
 * The consequence is that a typo produces the same screen as a success, so the
 * message repeats the address back — that is the only way someone can notice
 * they typed `gmial`.
 */

import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { ThemedText } from '@/components/themed-text';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { Theme } from '@/constants/theme';
import { useCooldown } from '@/hooks/use-cooldown';
import { isEmailish } from '@/lib/credentials';
import { useSession } from '@/lib/session';
import { useThemedStyles } from '@/lib/styles';

/** Seconds before "send again" is offered. Comfortably inside Supabase's own. */
const ResendCooldown = 45;

export default function ForgotPasswordScreen() {
  const { requestPasswordReset, linkError, clearLinkError, backendError } = useSession();
  const styles = useThemedStyles(sheet);

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  /** Set once the request went through. Also what switches the screen's copy. */
  const [sent, setSent] = useState<string | null>(null);

  const input = useRef<TextInput>(null);
  const cooldown = useCooldown(ResendCooldown);

  // Someone who arrived here from a dead link deserves to see why before being
  // asked to type their address again — and someone whose backend is down needs
  // that first, since no address they type can produce an email.
  const error = backendError ?? linkError ?? formError;

  const submit = async () => {
    if (submitting || cooldown.active) return;

    setFormError(null);
    clearLinkError();

    if (!email.trim()) {
      setFieldError('Enter your email address.');
      input.current?.focus();
      return;
    }
    if (!isEmailish(email)) {
      setFieldError('That does not look like an email address.');
      input.current?.focus();
      return;
    }

    setFieldError(null);
    setSubmitting(true);

    try {
      const result = await requestPasswordReset(email);

      if (result.error) {
        setFormError(result.error);
        return;
      }

      setSent(result.message ?? null);
      cooldown.start();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <View style={styles.head}>
        <ThemedText variant="heading">{sent ? 'Check your email' : 'Reset your password'}</ThemedText>
        <ThemedText variant="caption" tone="textSecondary">
          {sent
            ? 'Open the link on this device — it signs you in just long enough to choose a new password.'
            : 'Tell us the address on your account and we will email you a link to set a new password.'}
        </ThemedText>
      </View>

      {error ? <Banner tone="error" message={error} /> : null}

      {sent ? (
        <>
          <Banner tone="success" message={sent} />

          <Button
            label={cooldown.active ? `Send again in ${cooldown.remaining}s` : 'Send it again'}
            variant="secondary"
            size="lg"
            block
            disabled={cooldown.active}
            loading={submitting}
            onPress={submit}
          />
        </>
      ) : (
        <>
          <Field
            ref={input}
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (fieldError) setFieldError(null);
              if (formError) setFormError(null);
              if (linkError) clearLinkError();
            }}
            error={fieldError ?? undefined}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="go"
            onSubmitEditing={submit}
            editable={!submitting}
            // The one field on the screen, and the person arrived here on
            // purpose — so they can start typing without a tap.
            autoFocus
          />

          <Button
            label="Email me a reset link"
            size="lg"
            block
            loading={submitting}
            onPress={submit}
          />
        </>
      )}

      <View style={styles.footer}>
        <Link href="/login" asChild>
          <Pressable accessibilityRole="link" hitSlop={8} onPress={clearLinkError}>
            <ThemedText variant="caption" tone="accentText">
              Back to sign in
            </ThemedText>
          </Pressable>
        </Link>
      </View>
    </AuthShell>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    head: {
      gap: t.space.one,
    },
    footer: {
      alignItems: 'center',
    },
  });
