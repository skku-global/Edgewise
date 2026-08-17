/**
 * Coach — ask Claude about your own trading history.
 *
 * The whole point is that the answers are grounded: every request carries a
 * briefing built from the user's real trades and the moods attached to them
 * (`lib/trade-context.ts`), so this is not a general-purpose chatbot bolted onto
 * a journal.
 *
 * `Screen scroll={false}`, because this screen owns its scrolling: the log
 * scrolls and the composer stays pinned. Handing the scroll to `Screen` would
 * put the composer at the bottom of the content rather than the bottom of the
 * screen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import type { Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { askClaude, hasClaudeKey, type ClaudeTurn } from '@/lib/claude-client';
import { useThemedStyles } from '@/lib/styles';
import { buildTradingContext, fetchTradingContext, type ContextTrade } from '@/lib/trade-context';

/** Starter questions, so an empty chat is not a blank prompt box. */
const SUGGESTIONS = [
  'Why do I keep losing on breakout trades?',
  'Which setup is actually making me money?',
  'Does my mood change my results?',
  'What should I stop doing?',
];

type ChatMessage = ClaudeTurn & { id: string; failed?: boolean };

export default function ChatScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [trades, setTrades] = useState<ContextTrade[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const keyed = hasClaudeKey();

  const loadContext = useCallback(async () => {
    try {
      setLoadError(null);
      setTrades(await fetchTradingContext());
    } catch (err) {
      console.error(err);
      setLoadError("Couldn't load your trades, so answers would be guesswork.");
    }
  }, []);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || sending || !trades) {
        return;
      }

      const outgoing: ChatMessage = {
        id: `u-${messages.length}-${question.slice(0, 12)}`,
        role: 'user',
        content: question,
      };
      // Snapshot the history the request is built from, so a fast second send
      // can't race the state update and drop the previous turn.
      const history: ClaudeTurn[] = [
        ...messages
          .filter((message) => !message.failed)
          .map(({ role, content }) => ({ role, content })),
        { role: 'user', content: question },
      ];

      setMessages((current) => [...current, outgoing]);
      setDraft('');
      setSending(true);

      try {
        const answer = await askClaude(buildTradingContext(trades), history);
        setMessages((current) => [
          ...current,
          {
            id: `a-${current.length}`,
            role: 'assistant',
            content: answer.trim() || '(Claude returned an empty reply.)',
          },
        ]);
      } catch (err) {
        console.error(err);
        setMessages((current) => [
          ...current,
          {
            id: `e-${current.length}`,
            role: 'assistant',
            content:
              err instanceof Error
                ? `Couldn't reach Claude — ${err.message}`
                : "Couldn't reach Claude.",
            failed: true,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [messages, sending, trades],
  );

  const loading = trades === null && loadError === null;
  const canSend = keyed && !!trades && !sending && draft.trim().length > 0;

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.log}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <ScreenHeader
            title="Coach"
            subtitle={
              trades
                ? `Claude can see all ${trades.length} of your logged ${
                    trades.length === 1 ? 'trade' : 'trades'
                  } and the moods attached to them.`
                : 'Loading your trading history…'
            }
          />

          {!keyed ? (
            <Card style={styles.notice}>
              <ThemedText variant="heading">Add a Claude API key</ThemedText>
              <ThemedText variant="body" tone="textSecondary">
                Chat needs a key before it can answer. Copy{' '}
                <ThemedText variant="mono">.env.example</ThemedText> to{' '}
                <ThemedText variant="mono">.env.local</ThemedText>, fill it in, then restart the
                dev server.
              </ThemedText>
              <ThemedText variant="caption" tone="textTertiary">
                Anything prefixed EXPO_PUBLIC_ is embedded in the app bundle in plain text, so use
                the proxy option in that file for anything beyond local testing.
              </ThemedText>
            </Card>
          ) : null}

          {loadError ? <ErrorState message={loadError} onRetry={loadContext} /> : null}

          {loading ? <LoadingState label="Reading your history…" /> : null}

          {trades?.length === 0 ? (
            <EmptyState
              title="No trades yet"
              body="Log a few trades on the Trades tab and Claude will have something to work with."
            />
          ) : null}

          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.bubble,
                message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                message.failed && styles.failedBubble,
              ]}
            >
              <ThemedText
                variant="body"
                tone={message.failed ? 'loss' : message.role === 'user' ? 'textOnFill' : 'text'}
              >
                {message.content}
              </ThemedText>
            </View>
          ))}

          {sending ? (
            <View style={[styles.bubble, styles.assistantBubble, styles.thinking]}>
              <ActivityIndicator color={theme.color.accent} />
              <ThemedText variant="caption" tone="textTertiary">
                Reading your trades…
              </ThemedText>
            </View>
          ) : null}

          {keyed && messages.length === 0 && !!trades?.length ? (
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  accessibilityRole="button"
                  onPress={() => send(suggestion)}
                  disabled={sending}
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                >
                  <ThemedText variant="label" tone="accentText">
                    {suggestion}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={keyed ? 'Ask about your trades…' : 'Add an API key to chat'}
            placeholderTextColor={theme.color.textTertiary}
            selectionColor={theme.color.accent}
            editable={keyed && !!trades}
            multiline
            onSubmitEditing={() => send(draft)}
            // Enter sends, Shift+Enter makes a newline — the usual chat
            // behaviour, and on web multiline inputs it has to be wired up.
            blurOnSubmit={false}
            testID="chat-input"
          />
          <Button
            label="Send"
            loading={sending}
            disabled={!canSend}
            onPress={() => send(draft)}
            testID="chat-send"
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    fill: {
      flex: 1,
    },
    log: {
      gap: t.space.three,
      paddingBottom: t.space.three,
    },
    notice: {
      gap: t.space.two,
    },
    bubble: {
      borderRadius: t.radius.lg,
      paddingHorizontal: t.space.three,
      paddingVertical: t.space.two,
      maxWidth: '88%',
    },
    // The squared-off corner points at its sender — the cheapest way to make a
    // log readable at a glance without avatars or name labels.
    userBubble: {
      alignSelf: 'flex-end',
      backgroundColor: t.color.accent,
      borderBottomRightRadius: t.radius.xs,
    },
    assistantBubble: {
      alignSelf: 'flex-start',
      backgroundColor: t.color.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.border,
      borderBottomLeftRadius: t.radius.xs,
    },
    failedBubble: {
      backgroundColor: t.color.lossSoft,
      borderColor: t.color.loss,
    },
    thinking: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.two,
    },
    suggestions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: t.space.two,
    },
    chip: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.color.accent,
      backgroundColor: t.color.accentSoft,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space.three,
      paddingVertical: t.space.two,
    },
    chipPressed: {
      opacity: 0.7,
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: t.space.two,
      paddingTop: t.space.two,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.color.border,
      backgroundColor: t.color.bg,
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: t.color.borderStrong,
      borderRadius: t.radius.lg,
      paddingHorizontal: t.space.three,
      paddingVertical: t.space.two,
      color: t.color.text,
      backgroundColor: t.color.bgSunken,
      ...t.type.body,
      // 16px minimum, as in Field: anything smaller makes mobile Safari zoom on
      // focus and never zoom back out.
      fontSize: 16,
      maxHeight: 120,
      // Matches the Button's md height so the two line up rather than the input
      // sitting a few pixels proud of it.
      minHeight: 44,
    },
  });
