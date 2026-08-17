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
 * `autoComplete` / `textContentType` on every field: without them a password
 * manager cannot fill the form and iOS will not offer to save the credentials,
 * which is the difference between an app people sign into and one they give up
 * on. The previous version had neither.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { MaxContentWidth, type Theme } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { useThemedStyles } from '@/lib/styles';

type Mode = 'signIn' | 'signUp';

export default function LoginScreen() {
  const { signIn, signUp } = useSession();
  const router = useRouter();
  const styles = useThemedStyles(sheet);

  const [mode, setMode] = useState<Mode>('signIn');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isSignUp = mode === 'signUp';

  const switchMode = () => {
    setMode(isSignUp ? 'signIn' : 'signUp');
    setError('');
    setNotice('');
  };

  // Any keystroke clears the last failure: an error message that outlives the
  // input it described is just noise.
  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    if (error) {
      setError('');
    }
  };

  async function submit() {
    setError('');
    setNotice('');

    if (isSignUp && (!firstName.trim() || !lastName.trim())) {
      setError('Enter your first and last name.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    // Supabase rejects anything shorter with a message about the password
    // policy; catching it here saves a round trip and says it plainly.
    if (isSignUp && password.length < 6) {
      setError('Use at least 6 characters for your password.');
      return;
    }

    setLoading(true);

    const result = isSignUp
      ? await signUp({ email, password, firstName, lastName })
      : await signIn(email, password);

    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.message) {
      // Confirmation required — there is no session yet, so stay put and say so.
      setNotice(result.message);
      setPassword('');
      return;
    }

    // On success the root layout's guard usually moves the user on its own. This
    // covers the one case it cannot: arriving here by deep link while already
    // signed in, where the guard was satisfied before this screen mounted.
    router.replace('/');
  }

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brand}>
              <View style={styles.mark}>
                <ThemedText variant="title" tone="textOnFill">
                  E
                </ThemedText>
              </View>
              <ThemedText variant="display" tone="heroText">
                Edgewise
              </ThemedText>
              <ThemedText variant="body" tone="heroMuted" style={styles.tagline}>
                Know your edge. Watch your head.
              </ThemedText>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <ThemedText variant="heading">
                  {isSignUp ? 'Create your account' : 'Welcome back'}
                </ThemedText>
                <ThemedText variant="body" tone="textSecondary">
                  {isSignUp
                    ? 'Start journaling your trades and the state of mind behind them.'
                    : 'Sign in to your trading journal.'}
                </ThemedText>
              </View>

              {error ? (
                <View style={[styles.banner, styles.errorBanner]}>
                  <ThemedText variant="label" tone="loss">
                    {error}
                  </ThemedText>
                </View>
              ) : null}

              {notice ? (
                <View style={[styles.banner, styles.noticeBanner]}>
                  <ThemedText variant="label" tone="gain">
                    {notice}
                  </ThemedText>
                </View>
              ) : null}

              {isSignUp ? (
                <View style={styles.nameRow}>
                  <Field
                    label="First name"
                    value={firstName}
                    onChangeText={edit(setFirstName)}
                    placeholder="Alex"
                    autoCapitalize="words"
                    autoComplete="given-name"
                    textContentType="givenName"
                    editable={!loading}
                    containerStyle={styles.nameField}
                  />
                  <Field
                    label="Last name"
                    value={lastName}
                    onChangeText={edit(setLastName)}
                    placeholder="Morgan"
                    autoCapitalize="words"
                    autoComplete="family-name"
                    textContentType="familyName"
                    editable={!loading}
                    containerStyle={styles.nameField}
                  />
                </View>
              ) : null}

              <Field
                label="Email"
                value={email}
                onChangeText={edit(setEmail)}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                editable={!loading}
              />

              <Field
                label="Password"
                value={password}
                onChangeText={edit(setPassword)}
                placeholder="••••••••"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                // `newPassword` on sign-up is what makes iOS and Android offer a
                // generated password and then save it; `password` would only
                // offer to fill an existing one.
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                textContentType={isSignUp ? 'newPassword' : 'password'}
                hint={isSignUp ? 'At least 6 characters.' : undefined}
                editable={!loading}
                returnKeyType="go"
                onSubmitEditing={submit}
              />

              <Button
                label={isSignUp ? 'Create account' : 'Sign in'}
                size="lg"
                block
                loading={loading}
                onPress={submit}
                style={styles.submit}
              />

              <Button
                label={isSignUp ? 'I already have an account' : 'Create an account'}
                variant="ghost"
                block
                disabled={loading}
                onPress={switchMode}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    // The hero colour, full-bleed: this is the one screen with no content behind
    // it, so it gets to be the brand statement.
    page: {
      flex: 1,
      backgroundColor: t.color.hero,
    },
    safeArea: {
      flex: 1,
    },
    keyboardView: {
      flex: 1,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: t.space.five,
      padding: t.space.four,
    },
    brand: {
      alignItems: 'center',
      gap: t.space.two,
    },
    mark: {
      width: 56,
      height: 56,
      borderRadius: t.radius.lg,
      backgroundColor: t.color.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tagline: {
      textAlign: 'center',
    },
    card: {
      width: '100%',
      // Half the content ceiling: a 400px form is comfortable, and one stretched
      // to 800 looks like a table.
      maxWidth: MaxContentWidth / 2,
      backgroundColor: t.color.surface,
      borderRadius: t.radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.border,
      padding: t.space.four,
      gap: t.space.three,
      ...t.elevation[3],
    },
    cardHeader: {
      gap: t.space.one,
    },
    banner: {
      borderRadius: t.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      padding: t.space.three,
    },
    errorBanner: {
      backgroundColor: t.color.lossSoft,
      borderColor: t.color.loss,
    },
    noticeBanner: {
      backgroundColor: t.color.gainSoft,
      borderColor: t.color.gain,
    },
    nameRow: {
      flexDirection: 'row',
      gap: t.space.two,
    },
    nameField: {
      flex: 1,
    },
    submit: {
      marginTop: t.space.two,
    },
  });
