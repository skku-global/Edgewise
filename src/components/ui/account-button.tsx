/**
 * Account button and menu — the app's only way out.
 *
 * There was no sign-out anywhere before this: once signed in, the session
 * persisted to disk and the only way to end it was to delete the app. On a
 * shared or borrowed device that is a real problem, not a missing nicety.
 *
 * It lives in the dashboard header rather than a settings screen because there is
 * no settings screen, and inventing one to hold a single button would be worse
 * than putting the button where the user already is.
 *
 * Sign-out deliberately confirms first. It is not destructive — nothing is lost,
 * the data is on the server — but it is disruptive enough, and the button is
 * small enough, that a mis-tap should not end the session.
 */

import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Divider } from '@/components/ui/card';
import type { Theme } from '@/constants/theme';
import { displayName, initials, useSession } from '@/lib/session';
import { useThemedStyles } from '@/lib/styles';

export function AccountButton() {
  const { user } = useSession();
  const styles = useThemedStyles(sheet);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Account: ${displayName(user)}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
      >
        <ThemedText variant="label" tone="textOnFill">
          {initials(user)}
        </ThemedText>
      </Pressable>

      <AccountMenu open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AccountMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, signOut } = useSession();
  const styles = useThemedStyles(sheet);
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const close = () => {
    // Reset on the way out, or reopening lands mid-confirmation.
    setConfirming(false);
    onClose();
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    // No navigation and no state reset afterwards: the guard in the root layout
    // unmounts this whole tree the moment the session clears.
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close account menu">
        {/* Stops a tap inside the card from reaching the scrim behind it. */}
        <Pressable style={styles.menu} onPress={() => {}}>
          <View style={styles.identity}>
            <View style={styles.avatarLarge}>
              <ThemedText variant="heading" tone="textOnFill">
                {initials(user)}
              </ThemedText>
            </View>
            <View style={styles.identityText}>
              <ThemedText variant="subheading" numberOfLines={1}>
                {displayName(user)}
              </ThemedText>
              <ThemedText variant="caption" tone="textTertiary" numberOfLines={1}>
                {user?.email ?? 'Not signed in'}
              </ThemedText>
            </View>
          </View>

          <Divider />

          {confirming ? (
            <View style={styles.actions}>
              <ThemedText variant="body" tone="textSecondary">
                Sign out of Edgewise? Your trades stay on the server — you will just need to sign
                back in.
              </ThemedText>
              <Button
                label="Sign out"
                variant="danger"
                block
                loading={signingOut}
                onPress={handleSignOut}
              />
              <Button
                label="Cancel"
                variant="ghost"
                block
                disabled={signingOut}
                onPress={() => setConfirming(false)}
              />
            </View>
          ) : (
            <View style={styles.actions}>
              <Button
                label="Sign out"
                variant="secondary"
                block
                onPress={() => setConfirming(true)}
              />
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    avatar: {
      width: 40,
      height: 40,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLarge: {
      width: 48,
      height: 48,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.7,
    },
    scrim: {
      flex: 1,
      backgroundColor: t.color.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      padding: t.space.four,
    },
    menu: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: t.color.surfaceRaised,
      borderRadius: t.radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.border,
      padding: t.space.three,
      gap: t.space.three,
      ...t.elevation[3],
    },
    identity: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.three,
    },
    identityText: {
      flexShrink: 1,
      gap: t.space.half,
    },
    actions: {
      gap: t.space.two,
    },
  });
