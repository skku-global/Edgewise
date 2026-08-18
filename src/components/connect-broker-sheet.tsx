/**
 * Connect MetaTrader — the setup flow for automatic trade import.
 *
 * The advisor in `mt5/` has always worked; what was missing was any way for a
 * user who is not the developer to set it up. The instructions lived in a README
 * in the repository, and the four values the advisor needs — project URL,
 * publishable key, email, password — were things only someone with access to the
 * Supabase dashboard could find.
 *
 * So this screen hands each user their own credential block, filled in, with a
 * copy button on every row. Three of the four are things the app already knows.
 * The fourth is the user's password, which the app deliberately does not know and
 * does not ask for: it is typed straight into MetaTrader on their own machine.
 *
 * It also answers the question the README cannot — "is it working?" — by reading
 * the trades already loaded: how many arrived from a broker, from which account,
 * and when the last one closed.
 */

import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, Divider, SectionHeader } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import type { Theme } from '@/constants/theme';
import {
  EA_FILE_NAME,
  eaSettings,
  relativeTime,
  syncStatus,
  type EaSetting,
} from '@/lib/broker-sync';
import { useSession } from '@/lib/session';
import { useThemedStyles } from '@/lib/styles';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/supabase';
import type { TradeRow } from '@/lib/trade-table';

/**
 * The manual steps, in the order MetaTrader wants them.
 *
 * Steps 1, 2 and 3 exist because of a real failure, not caution. The first setup
 * on a machine here logged `backfilling 90 days (0 deals to scan)` and then
 * `0 sent, 0 failed`, which reads like a clean import — the advisor had been
 * attached in the same second the terminal switched accounts, before the broker
 * connection was up. MetaTrader re-downloads trade history on connect and keeps
 * none of it on disk, so there was genuinely nothing to read. Confirming the
 * history is visible *before* attaching turns a silent non-import into a step you
 * cannot pass by accident.
 */
const STEPS = [
  {
    title: 'Install MetaTrader 5 on a PC and sign in',
    body: 'Same broker, same login you trade from. Wait until your broker name and balance actually appear — MetaTrader downloads your history when it connects, and an advisor started before that sees none of it. You do not have to keep the PC on afterwards.',
  },
  {
    title: 'Check your history is there',
    body: 'Toolbox at the bottom → History tab → right-click → set the period to All. Your closed trades should be listed. If this is empty there is nothing to import yet, and no amount of setup will change that.',
  },
  {
    title: `Drop ${EA_FILE_NAME} into MQL5\\Experts`,
    body: 'In MetaTrader: File → Open Data Folder, then the MQL5\\Experts folder. Open it in MetaEditor and press F7 to compile — expect 0 errors. If an older SkkuJournalSync is in there, remove it from any chart: it predates private journals and can no longer write.',
  },
  {
    title: 'Allow the app to reach your journal',
    body: 'Tools → Options → Expert Advisors → tick "Allow WebRequest for listed URL" and add the project URL below, exactly, with no trailing slash. This is the step everyone misses; without it nothing is ever sent.',
  },
  {
    title: 'Drag it onto any chart',
    body: 'Which chart does not matter — it reads the whole account. Tick "Allow Algo Trading" on the Common tab, then fill in the four inputs below on the Inputs tab. Leave DryRun on for the first run and nothing is written.',
  },
  {
    title: 'Watch the Experts tab',
    body: 'It prints what it did: signed in, how many trades it found, how many it sent. A dry run says how many it would have sent — set DryRun to false and drag it on again to import them for real. A smiley face on the chart means it is running.',
  },
];

export type ConnectBrokerSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The loaded history, for reading sync status. No extra query. */
  trades: TradeRow[];
  /** Whether the app's realtime channel is connected. */
  live: boolean;
};

export function ConnectBrokerSheet({ visible, onClose, trades, live }: ConnectBrokerSheetProps) {
  const styles = useThemedStyles(sheet);
  const { user } = useSession();

  const status = syncStatus(trades);
  const settings = eaSettings({
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_PUBLISHABLE_KEY,
    email: user?.email,
  });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Connect MetaTrader"
      subtitle="Set this up once and closed trades arrive on their own — numbers filled in, ready to tag."
      footer={<Button label="Done" size="lg" block onPress={onClose} />}
    >
      {/* Status first. Someone opening this screen a second time is here to find
          out whether it worked, not to read the instructions again. */}
      <View style={styles.statusCard}>
        <View style={styles.statusTop}>
          <ThemedText variant="overline" tone="heroMuted">
            SYNC STATUS
          </ThemedText>
          <Pill
            label={live ? 'Live' : 'Checking every minute'}
            tone={live ? 'gain' : 'neutral'}
            solid={live}
          />
        </View>

        <ThemedText variant="title" tone="heroText">
          {status.connected
            ? `${status.synced} ${status.synced === 1 ? 'trade' : 'trades'} imported`
            : 'Nothing imported yet'}
        </ThemedText>

        <ThemedText variant="body" tone="heroMuted">
          {status.connected
            ? `Last one closed ${relativeTime(status.lastTradeAt!, new Date())}${
                status.accounts.length > 0 ? ` · account ${status.accounts.join(', ')}` : ''
              }.`
            : status.manual > 0
              ? `Your ${status.manual} typed ${status.manual === 1 ? 'trade is' : 'trades are'} safe — importing adds to them, it does not replace them.`
              : 'Follow the five steps below and your closed trades will appear here.'}
        </ThemedText>
      </View>

      {/* The credentials are the part that cannot be written down in advance, so
          they come before the prose. */}
      <View>
        <SectionHeader
          title="Your four inputs"
          subtitle="Paste these into the advisor's Inputs tab. Tap a row to copy it."
        />
        <Card>
          {settings.map((setting, index) => (
            <View key={setting.label}>
              {index > 0 ? <Divider /> : null}
              <SettingRow setting={setting} />
            </View>
          ))}
        </Card>
      </View>

      <View>
        {/* Counted from the list rather than written out, so adding a step
            cannot leave the heading claiming a number that is no longer true. */}
        <SectionHeader
          title={`${STEPS.length} steps, once`}
          subtitle="Fifteen minutes, and then never again."
        />
        <Card>
          {STEPS.map((step, index) => (
            <View key={step.title}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.step}>
                <View style={styles.stepNumber}>
                  <ThemedText variant="label" tone="textOnFill">
                    {index + 1}
                  </ThemedText>
                </View>
                <View style={styles.stepText}>
                  <ThemedText variant="bodyStrong">{step.title}</ThemedText>
                  <ThemedText variant="caption" tone="textSecondary">
                    {step.body}
                  </ThemedText>
                </View>
              </View>
            </View>
          ))}
        </Card>
      </View>

      <View>
        <SectionHeader title="Why it asks for your password" />
        <Card style={styles.prose}>
          <ThemedText variant="body" tone="textSecondary">
            Your journal is private per account. The publishable key on its own is
            anonymous — it owns no trades and cannot write any. So the advisor signs in
            the same way this app does, gets a token that says it is you, and sends that
            with each trade.
          </ThemedText>
          <ThemedText variant="body" tone="textSecondary">
            Your password is typed into MetaTrader on your own PC and sent only to your own
            database over HTTPS. It is never stored in this app and never passes through
            anything of ours.
          </ThemedText>
        </Card>
      </View>

      <View>
        <SectionHeader title="What arrives" />
        <Card style={styles.prose}>
          <ThemedText variant="body" tone="textSecondary">
            Pair, direction, entry and exit price, lot size, net P/L after commission and
            swap, and the real open and close times — so a scalp you actually held for six
            hours reads as one.
          </ThemedText>
          <ThemedText variant="body" tone="textSecondary">
            Left blank on purpose: setup and mood. Your broker knows what happened, not why
            you took it or how you felt. The dashboard will ask you for those, one trade at
            a time.
          </ThemedText>
          <ThemedText variant="caption" tone="textTertiary">
            Only closed trades are sent, and re-sending is safe — each trade carries its
            broker position id, so importing twice cannot duplicate a row.
          </ThemedText>
        </Card>
      </View>
    </Sheet>
  );
}

/**
 * One credential row: label, value, and a copy button.
 *
 * Copy rather than select-and-drag because the key is roughly 200 characters of
 * base64 and this is often being read on a phone while typing on a PC. The
 * confirmation replaces the button's own label — a toast would appear away from
 * the thing that was tapped, which for four near-identical rows is exactly the
 * wrong place for it.
 */
function SettingRow({ setting }: { setting: EaSetting }) {
  const styles = useThemedStyles(sheet);
  const [copied, setCopied] = useState(false);

  const copyable = !setting.secret && setting.value.length > 0;

  const copy = async () => {
    await Clipboard.setStringAsync(setting.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Pressable
      accessibilityRole={copyable ? 'button' : 'text'}
      accessibilityLabel={copyable ? `Copy ${setting.label}` : setting.label}
      disabled={!copyable}
      onPress={copy}
      style={({ pressed }) => [styles.settingRow, pressed && copyable && styles.settingPressed]}
    >
      <View style={styles.settingText}>
        <ThemedText variant="mono" tone="textSecondary">
          {setting.label}
        </ThemedText>

        {setting.value ? (
          // Truncated to two lines: the publishable key is long enough to push
          // everything else off the screen, and it is being copied, not read.
          <ThemedText variant="body" numberOfLines={2}>
            {setting.value}
          </ThemedText>
        ) : (
          <ThemedText variant="body" tone="textTertiary">
            {setting.secret ? 'You type this one' : 'Not configured'}
          </ThemedText>
        )}

        <ThemedText variant="caption" tone="textTertiary">
          {setting.hint}
        </ThemedText>
      </View>

      {copyable ? (
        <View style={styles.copyBadge}>
          <ThemedText variant="caption" tone={copied ? 'gain' : 'accentText'}>
            {copied ? 'Copied' : 'Copy'}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    statusCard: {
      backgroundColor: t.color.hero,
      borderRadius: t.radius.xl,
      padding: t.space.four,
      gap: t.space.one,
    },
    statusTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.two,
      marginBottom: t.space.one,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.two,
      paddingVertical: t.space.two,
    },
    settingPressed: {
      opacity: 0.6,
    },
    settingText: {
      flex: 1,
      gap: t.space.half,
    },
    copyBadge: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.accent,
      backgroundColor: t.color.accentSoft,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space.two,
      paddingVertical: t.space.one,
    },
    step: {
      flexDirection: 'row',
      gap: t.space.two,
      paddingVertical: t.space.two,
    },
    stepNumber: {
      width: 24,
      height: 24,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepText: {
      flex: 1,
      gap: t.space.half,
    },
    prose: {
      gap: t.space.two,
    },
  });
