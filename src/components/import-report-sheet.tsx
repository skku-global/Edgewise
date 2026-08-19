/**
 * Import an MT5 report — the no-setup path to a full trade history.
 *
 * The ask this answers was "generate my account history from just my account
 * number". That is not possible, and the reason is worth stating plainly: an MT5
 * login is an identifier, not a credential. No MetaQuotes API takes a number and
 * returns trades, and the sites that appear to do it are holding the account's
 * investor password and signing in from their own servers. The only honest way to
 * get history without a password is to read the file MetaTrader itself exports.
 *
 * So this is the shape of the answer: two clicks in MetaTrader, pick the file,
 * see exactly what would be written, confirm. It needs no advisor, no URL
 * whitelist, no PC left running, and it is the only route that works for someone
 * who wants their last year of trades in the journal in the next minute.
 *
 * It does not replace the advisor and is not offered as a fallback to it. The
 * advisor is ongoing and automatic; this is a one-shot catch-up. A user who does
 * both ends up with one row per trade rather than two, because both key
 * `external_id` on the broker's position id.
 *
 * ## The preview is the point
 *
 * Nothing is written until the counts have been shown. That mirrors the advisor's
 * DryRun, and for the same reason: this writes into a table the app computes win
 * rate and psychology stats from, so a silent misread would not look like a bug,
 * it would look like a worse trader. "142 found · 137 new · 5 already here" is
 * the sentence that makes an import safe to run twice.
 */

import * as DocumentPicker from 'expo-document-picker';
import { File as FsFile } from 'expo-file-system';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, Divider, SectionHeader } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import type { Theme } from '@/constants/theme';
import { formatShortDate } from '@/lib/format';
import {
  Mt5ReportError,
  parseMt5Report,
  planImport,
  type ImportRange,
  type Mt5Report,
  type TradeInsert,
} from '@/lib/mt5-report';
import { useSession } from '@/lib/session';
import { useThemedStyles } from '@/lib/styles';
import { supabase } from '@/lib/supabase';
import type { TradeRow } from '@/lib/trade-table';

/**
 * Rows per request.
 *
 * One request for the whole report would be simpler, but a decade of trading is
 * thousands of rows and a single body large enough to be worth a timeout on a
 * phone connection. Chunking also means a failure halfway through has still
 * written the chunks before it, and because every write is an upsert on the
 * position id, running the import again picks up exactly where it stopped.
 */
const CHUNK_SIZE = 250;

/**
 * Refuse to parse anything larger, rather than locking the UI thread.
 *
 * A report is text, and even a very long history is well under this. A file this
 * big is a sign the wrong thing was picked.
 */
const MAX_BYTES = 20 * 1024 * 1024;

const RANGE_OPTIONS: { value: ImportRange; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'last-30-days', label: 'Last 30 days' },
];

type Stage = 'idle' | 'reading' | 'preview' | 'importing' | 'done';

/**
 * The steps in MetaTrader, which cannot be automated from here.
 *
 * Deliberately shorter than the advisor's six: this whole path exists for someone
 * who does not want to do the advisor's setup, so a wall of instructions would
 * defeat it.
 */
const EXPORT_STEPS = [
  'In MetaTrader, open the Toolbox at the bottom and pick the History tab.',
  'Right-click inside it and set the period to All — or Last month, if that is all you want.',
  'Right-click again, choose Report, then HTML.',
  'Pick that file below. If you exported on a PC, send it to yourself first.',
];

/**
 * Read the picked file as text.
 *
 * Two paths because the platforms hand back different things. On web the picker
 * returns a real browser `File` and there is no filesystem to read from; the
 * `uri` is a base64 data URL. On native it is a path in the cache directory,
 * which is why `copyToCacheDirectory` has to stay on.
 *
 * `new File(uri).text()` is the SDK 54 API. `readAsStringAsync` is deprecated and
 * throws at runtime now unless it is imported from `expo-file-system/legacy`.
 */
async function readPicked(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === 'web') {
    if (!asset.file) {
      throw new Mt5ReportError(
        'This browser did not hand over the file. Try picking it again, or open the app on your phone.',
      );
    }
    return asset.file.text();
  }

  return new FsFile(asset.uri).text();
}

/**
 * Turn a write failure into the one action that fixes it.
 *
 * Both of these are a migration that has not been run, and both are otherwise
 * indistinguishable from "the network is bad" — which would send someone looking
 * in the wrong place entirely.
 */
function describeWriteError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;

  // 42703 undefined_column: add-broker-sync.sql has not run, so there is nowhere
  // to put external_id, commission or the real open and close times.
  if (code === '42703') {
    return 'Your database is missing the broker-sync columns. Run scripts/add-broker-sync.sql in the Supabase SQL editor, then try again.';
  }

  // 42P10 invalid_column_reference: the unique index the upsert resolves against
  // is missing, so there is no way to tell a re-import from a duplicate.
  if (code === '42P10') {
    return 'Your database is missing the index that stops duplicate imports. Run scripts/secure-rls.sql in the Supabase SQL editor, then try again.';
  }

  return 'Those trades could not be saved. Check your connection and try again — anything already written is kept, and importing again will not duplicate it.';
}

export type ImportReportSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The loaded history, so deduping costs no extra query. */
  trades: TradeRow[];
  /** Called once rows have been written, so the caller can reload. */
  onImported: () => void;
};

export function ImportReportSheet({
  visible,
  onClose,
  trades,
  onImported,
}: ImportReportSheetProps) {
  const styles = useThemedStyles(sheet);
  const { user } = useSession();

  const [stage, setStage] = useState<Stage>('idle');
  const [range, setRange] = useState<ImportRange>('all');
  const [report, setReport] = useState<Mt5Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(0);

  /**
   * Every MT5 trade already in the journal, by broker position id.
   *
   * This is what makes "already here" a real number rather than a guess, and it
   * costs nothing: the list is already loaded for the screen behind this sheet.
   */
  const existingExternalIds = useMemo(
    () =>
      new Set(
        trades
          .filter((trade) => trade.source === 'mt5' && trade.external_id)
          .map((trade) => trade.external_id as string),
      ),
    [trades],
  );

  const plan = useMemo(
    () =>
      report && user ? planImport(report, { range, existingExternalIds, userId: user.id }) : null,
    [report, user, range, existingExternalIds],
  );

  const close = () => {
    onClose();
    // Reset so reopening starts clean rather than showing the last file's counts,
    // which would no longer match the journal it was compared against.
    setStage('idle');
    setReport(null);
    setError(null);
    setImported(0);
  };

  const pick = async () => {
    setError(null);

    // Not filtered by MIME type on purpose. File providers disagree about what an
    // .html file is — some say text/plain, some application/octet-stream — and a
    // filter that greys out the right file is worse than one that lets a wrong
    // file through, because every wrong file already gets a named error.
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });

    // Nothing is shown as busy until the picker has closed: on web the cancel
    // event never arrives, so a spinner started before this point would spin for
    // as long as the sheet stayed open.
    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];

    if (!asset) {
      return;
    }

    setStage('reading');

    try {
      if (asset.size !== undefined && asset.size > MAX_BYTES) {
        throw new Mt5ReportError(
          'That file is far too big to be a trade report. In MetaTrader: History tab, right-click, Report, HTML.',
        );
      }

      const parsed = parseMt5Report(await readPicked(asset));

      setReport(parsed);
      setStage('preview');
    } catch (err) {
      console.error(err);
      // Mt5ReportError messages are written for the person holding the file.
      // Anything else is a genuine surprise and gets a plain one.
      setError(
        err instanceof Mt5ReportError
          ? err.message
          : 'That file could not be read. It needs to be the HTML report MetaTrader exports from the History tab.',
      );
      setStage('idle');
    }
  };

  const runImport = async () => {
    if (!plan || plan.inserts.length === 0) {
      return;
    }

    setStage('importing');
    setError(null);

    let written = 0;

    try {
      for (let start = 0; start < plan.inserts.length; start += CHUNK_SIZE) {
        const chunk: TradeInsert[] = plan.inserts.slice(start, start + CHUNK_SIZE);

        // ignoreDuplicates rather than merge. A row already present came from the
        // advisor, and the advisor's copy is the better one: it carries true UTC
        // instead of the report's unlabelled server time, and it may sit under a
        // setup and notes the user has added since. `planImport` has already
        // filtered those out — this is the guard for the list being a few seconds
        // stale, or a second device importing at the same moment.
        const { error: writeError } = await supabase
          .from('trades')
          .upsert(chunk, { onConflict: 'user_id,source,external_id', ignoreDuplicates: true });

        if (writeError) {
          throw writeError;
        }

        written += chunk.length;
      }

      setImported(written);
      setStage('done');
      onImported();
    } catch (err) {
      console.error(err);
      setError(describeWriteError(err));
      setImported(written);
      setStage('preview');

      // Whatever landed before the failure is real. Reloading means the next
      // attempt counts those rows as already here instead of trying them again.
      if (written > 0) {
        onImported();
      }
    }
  };

  const busy = stage === 'reading' || stage === 'importing';

  const renderFooter = () => {
    if (stage === 'done') {
      return <Button label="Done" size="lg" block onPress={close} />;
    }

    if (stage === 'importing') {
      return <Button label="Importing" size="lg" block loading />;
    }

    if (stage === 'preview' && plan) {
      return (
        <View style={styles.footerRow}>
          <Button label="Another file" variant="ghost" size="lg" onPress={pick} />
          <Button
            label={plan.inserts.length > 0 ? `Import ${plan.inserts.length}` : 'Nothing new'}
            size="lg"
            style={styles.footerPrimary}
            disabled={plan.inserts.length === 0}
            onPress={runImport}
          />
        </View>
      );
    }

    return (
      <Button
        label="Choose your report"
        size="lg"
        block
        loading={stage === 'reading'}
        onPress={pick}
      />
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Import from a report"
      subtitle="Your whole history in four taps — no advisor, no password, nothing left running."
      footer={renderFooter()}
    >
      {error ? <Banner tone="error" message={error} /> : null}

      {stage === 'done' ? (
        <View style={styles.heroCard}>
          <ThemedText variant="overline" tone="heroMuted">
            IMPORTED
          </ThemedText>

          <ThemedText variant="title" tone="heroText">
            {imported} {imported === 1 ? 'trade' : 'trades'} added
          </ThemedText>

          <ThemedText variant="body" tone="heroMuted">
            They are on your dashboard and calendar already. Setup and mood are blank on
            purpose — tag them from the Trades tab and the psychology stats start working.
          </ThemedText>
        </View>
      ) : plan ? (
        <>
          {/* Counts before anything else. This is the screen someone is deciding
              on, and the decision is entirely about these three numbers. */}
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <ThemedText variant="overline" tone="heroMuted">
                READY TO IMPORT
              </ThemedText>
              {report?.accountLogin ? (
                <Pill label={`Account ${report.accountLogin}`} tone="neutral" />
              ) : null}
            </View>

            <ThemedText variant="title" tone="heroText">
              {plan.inserts.length} {plan.inserts.length === 1 ? 'new trade' : 'new trades'}
            </ThemedText>

            <ThemedText variant="body" tone="heroMuted">
              {`${plan.inRange} in this range · ${plan.inserts.length} new · ${plan.alreadyHere} already here`}
            </ThemedText>

            {plan.earliest && plan.latest ? (
              <ThemedText variant="caption" tone="heroMuted">
                {`Closing between ${formatShortDate(plan.earliest)} and ${formatShortDate(plan.latest)}.`}
              </ThemedText>
            ) : null}
          </View>

          <View>
            <SectionHeader
              title="How much of it"
              subtitle="The file holds everything you exported. This is how much to take from it."
            />
            <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} disabled={busy} />
          </View>

          {report && report.warnings.length > 0 ? (
            <View>
              <SectionHeader title="Worth knowing" />
              <Card style={styles.prose}>
                {report.warnings.map((warning) => (
                  <ThemedText key={warning} variant="caption" tone="textTertiary">
                    {warning}
                  </ThemedText>
                ))}
              </Card>
            </View>
          ) : null}

          <View>
            <SectionHeader title="What gets written" />
            <Card style={styles.prose}>
              <ThemedText variant="body" tone="textSecondary">
                Pair, direction, entry and exit price, lot size, net P/L after commission and
                swap, and the real open and close times — so a trade you actually held for six
                hours reads as one.
              </ThemedText>
              <ThemedText variant="caption" tone="textTertiary">
                A trade already in your journal is left exactly as it is, including anything
                you have tagged on it. Running this a second time changes nothing.
              </ThemedText>
            </Card>
          </View>
        </>
      ) : (
        <>
          <View style={styles.heroCard}>
            <ThemedText variant="overline" tone="heroMuted">
              NO SETUP, NO PASSWORD
            </ThemedText>

            <ThemedText variant="title" tone="heroText">
              Export it, then pick it
            </ThemedText>

            <ThemedText variant="body" tone="heroMuted">
              Nothing is written until you have seen exactly what would be: how many trades,
              from which account, over what dates.
            </ThemedText>
          </View>

          <View>
            <SectionHeader
              title={`${EXPORT_STEPS.length} steps`}
              subtitle="And then it is done. There is nothing to leave running."
            />
            <Card>
              {EXPORT_STEPS.map((step, index) => (
                <View key={step}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.step}>
                    <View style={styles.stepNumber}>
                      <ThemedText variant="label" tone="textOnFill">
                        {index + 1}
                      </ThemedText>
                    </View>
                    <View style={styles.stepText}>
                      <ThemedText variant="body">{step}</ThemedText>
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          </View>

          <View>
            <SectionHeader title="Why not just your account number?" />
            <Card style={styles.prose}>
              <ThemedText variant="body" tone="textSecondary">
                An account number identifies your account — it does not open it. Getting your
                trades from a number alone would mean someone holding your investor password
                and signing in as you, which is exactly what the sites offering it do.
              </ThemedText>
              <ThemedText variant="body" tone="textSecondary">
                MetaTrader hands you the same history in two clicks, so this reads that
                instead. Your password stays yours, and the only thing that leaves your
                machine is the trades.
              </ThemedText>
            </Card>
          </View>

          <View>
            <SectionHeader title="Or set it up once and forget it" />
            <Card style={styles.prose}>
              <ThemedText variant="body" tone="textSecondary">
                This is a one-off catch-up. Connect MetaTrader instead — or as well — and
                closed trades arrive on their own from then on. Doing both is safe: every
                trade carries its broker position id, so it can only ever land once.
              </ThemedText>
            </Card>
          </View>
        </>
      )}
    </Sheet>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    heroCard: {
      backgroundColor: t.color.hero,
      borderRadius: t.radius.xl,
      padding: t.space.four,
      gap: t.space.one,
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.two,
      marginBottom: t.space.one,
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
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.two,
    },
    footerPrimary: {
      flex: 1,
    },
  });
