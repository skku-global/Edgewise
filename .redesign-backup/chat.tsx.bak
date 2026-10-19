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
 *
 * Voice: the mic button records a clip (expo-audio), `lib/voice.ts` sends it to
 * the proxy to be turned into text, and the words land in the text box so you
 * can fix them before sending. Voice never sends anything by itself.
 */

import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
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
import { VoiceQueueBanner } from '@/components/voice-queue-banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import type { Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { askClaude, hasClaudeKey, type ClaudeTurn } from '@/lib/claude-client';
import {
  describeEntry,
  extractEntry,
  looksLikeSave,
  missingFor,
  saveChatEntry,
  type ChatEntry,
} from '@/lib/chat-save';
import { askWithImage, pickScreenshots, type PickedImage } from '@/lib/coach-vision';
import { useThemedStyles } from '@/lib/styles';
import { buildTradingContext, fetchTradingContext, type ContextTrade } from '@/lib/trade-context';
import { transcribeOrQueue } from '@/lib/voice-queue';

/** Starter questions, so an empty chat is not a blank prompt box. */
const SUGGESTIONS = [
  'Why do I keep losing on breakout trades?',
  'Which setup is actually making me money?',
  'Does my mood change my results?',
  'What should I stop doing?',
];

type PendingState = 'open' | 'saving' | 'saved' | 'discarded';

type ChatMessage = ClaudeTurn & {
  id: string;
  failed?: boolean;
  attachment?: string;
  /** Something the AI understood from what you said, waiting for you to confirm it. */
  pending?: ChatEntry;
  pendingState?: PendingState;
  pendingNote?: string;
};

/** Used when you attach a screenshot but type nothing. */
const DEFAULT_IMAGE_QUESTION =
  'Look at this screenshot. Where did I enter and exit, and what stands out about this trade?';

export default function ChatScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(sheet);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [trades, setTrades] = useState<ContextTrade[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [attached, setAttached] = useState<PickedImage[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const keyed = hasClaudeKey();

  // Voice recording. HIGH_QUALITY gives an .m4a file on phones, which Gemini accepts.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const recording = recorderState.isRecording;

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

  /** Tap once to start recording, tap again to stop and turn it into text. */
  const toggleMic = useCallback(async () => {
    setVoiceError(null);
    try {
      if (recording) {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) {
          throw new Error('The recording was empty. Hold the mic a little longer.');
        }
        setTranscribing(true);
        const result = await transcribeOrQueue(uri);
        if (result.queued) {
          setVoiceError('No internet. Your recording is saved on this device. Tap "Write them out" when you are back online.');
        } else {
          // Add to whatever is already typed, so voice and typing can be mixed.
          setDraft((current) => (current.trim() ? `${current.trim()} ${result.text}` : result.text));
        }
        return;
      }

      // Android and iOS both ask the user the first time.
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) {
        setVoiceError('Microphone permission was denied. Turn it on in your phone settings.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      console.error(err);
      setVoiceError(err instanceof Error ? err.message : 'Voice failed. Try again.');
    } finally {
      setTranscribing(false);
    }
  }, [recorder, recording]);

  /** The "+" button: pick a screenshot to send with your next message. */
  const attach = useCallback(async () => {
    setVoiceError(null);
    try {
      const picked = await pickScreenshots();
      if (picked.length > 0) {
        setAttached((current) => [...current, ...picked].slice(0, 6));
      }
    } catch (err) {
      console.error(err);
      setVoiceError(err instanceof Error ? err.message : 'Could not attach that image.');
    }
  }, []);

  const addDraft = useCallback((text: string) => {
    setDraft((current) => (current.trim() ? `${current.trim()} ${text}` : text));
  }, []);

  const patchMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((current) => current.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  /** Save button on a confirm card: only now does anything reach your journal. */
  const confirmSave = useCallback(
    async (message: ChatMessage) => {
      if (!message.pending) return;
      patchMessage(message.id, { pendingState: 'saving', pendingNote: undefined });
      try {
        const done = await saveChatEntry(message.pending);
        patchMessage(message.id, { pendingState: 'saved', pendingNote: done });
        loadContext();
      } catch (err) {
        console.error(err);
        patchMessage(message.id, {
          pendingState: 'open',
          pendingNote: err instanceof Error ? err.message : 'Could not save that. Try again.',
        });
      }
    },
    [loadContext, patchMessage],
  );

  const send = useCallback(
    async (text: string, forceSave = false) => {
      const images = attached;
      const question = text.trim() || (images.length > 0 ? DEFAULT_IMAGE_QUESTION : '');
      if (!question || sending || !trades) {
        return;
      }

      const outgoing: ChatMessage = {
        id: `u-${messages.length}-${question.slice(0, 12)}`,
        role: 'user',
        content: question,
        attachment: images.length > 0 ? images.map((i) => i.name).join(', ') : undefined,
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
      setAttached([]);
      setSending(true);

      try {
        // "Save to journal", or a message that starts with log / save / add / journal:
        // turn it into a record and ask you to confirm. If it turns out to be a
        // question, fall through and answer it normally.
        if (forceSave || looksLikeSave(question)) {
          const entry = await extractEntry(
            text.trim() || 'Read the trade in the screenshots.',
            images,
          );
          if (entry.kind !== 'none') {
            setMessages((current) => [
              ...current,
              {
                id: `p-${current.length}`,
                role: 'assistant',
                content: entry.summary || 'Here is what I understood. Check it, then save.',
                pending: entry,
                pendingState: 'open',
              },
            ]);
            return;
          }
        }

        const briefing = buildTradingContext(trades);
        const answer =
          images.length > 0
            ? await askWithImage(briefing, history, images)
            : await askClaude(briefing, history);
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
    [attached, messages, sending, trades],
  );

  const loading = trades === null && loadError === null;
  const canSend =
    keyed &&
    !!trades &&
    !sending &&
    !recording &&
    !transcribing &&
    (draft.trim().length > 0 || attached.length > 0);
  const canRecord = keyed && !!trades && !sending && !transcribing;
  const canAttach = keyed && !!trades && !sending;

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
              {message.attachment ? (
                <ThemedText variant="caption" tone="textOnFill">
                  Screenshots: {message.attachment}
                </ThemedText>
              ) : null}
              {message.pending ? (
                <View style={styles.confirm}>
                  <ThemedText variant="overline" tone="textTertiary">
                    {describeEntry(message.pending).title.toUpperCase()}
                  </ThemedText>
                  {describeEntry(message.pending).lines.map((line) => (
                    <ThemedText key={line} variant="mono" tone="text">
                      {line}
                    </ThemedText>
                  ))}
                  <ThemedText variant="caption" tone="textTertiary">
                    Check every number. AI can mishear or misread one.
                  </ThemedText>
                  {missingFor(message.pending) && message.pendingState === 'open' ? (
                    <ThemedText variant="caption" tone="loss">
                      {missingFor(message.pending)}
                    </ThemedText>
                  ) : null}
                  {message.pendingNote ? (
                    <ThemedText
                      variant="caption"
                      tone={message.pendingState === 'saved' ? 'gain' : 'loss'}
                    >
                      {message.pendingNote}
                    </ThemedText>
                  ) : null}
                  {message.pendingState === 'open' || message.pendingState === 'saving' ? (
                    <View style={styles.confirmButtons}>
                      <Button
                        label="Save"
                        loading={message.pendingState === 'saving'}
                        disabled={!!missingFor(message.pending)}
                        onPress={() => confirmSave(message)}
                      />
                      <Button
                        label="Discard"
                        variant="secondary"
                        disabled={message.pendingState === 'saving'}
                        onPress={() =>
                          patchMessage(message.id, {
                            pendingState: 'discarded',
                            pendingNote: 'Discarded. Nothing was saved.',
                          })
                        }
                      />
                    </View>
                  ) : null}
                  {message.pendingState === 'discarded' ? (
                    <ThemedText variant="caption" tone="textSecondary">
                      {message.pendingNote}
                    </ThemedText>
                  ) : null}
                </View>
              ) : null}
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

        {recording || transcribing || voiceError ? (
          <View style={styles.voiceStatus}>
            {transcribing ? <ActivityIndicator color={theme.color.accent} /> : null}
            <ThemedText variant="caption" tone={voiceError ? 'loss' : 'textSecondary'}>
              {voiceError
                ? voiceError
                : recording
                  ? 'Recording… tap the mic again when you are done.'
                  : 'Turning your voice into text…'}
            </ThemedText>
          </View>
        ) : null}

        {attached.map((image, index) => (
          <View key={`${image.name}-${index}`} style={styles.attachedRow}>
            <Ionicons name="image" size={18} color={theme.color.accent} />
            <ThemedText variant="caption" tone="textSecondary" style={styles.attachedName}>
              {image.name}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${image.name}`}
              onPress={() => setAttached((current) => current.filter((_, i) => i !== index))}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={20} color={theme.color.textTertiary} />
            </Pressable>
          </View>
        ))}

        <VoiceQueueBanner onText={addDraft} />

        {canSend ? (
          <View style={styles.saveRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => send(draft, true)}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              testID="chat-save"
            >
              <ThemedText variant="label" tone="accentText">
                Save this to my journal instead
              </ThemedText>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.composer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attach screenshots"
            onPress={attach}
            disabled={!canAttach}
            style={({ pressed }) => [
              styles.plus,
              !canAttach && styles.micDisabled,
              pressed && styles.chipPressed,
            ]}
            testID="chat-attach"
          >
            <Ionicons name="add" size={26} color={theme.color.text} />
          </Pressable>
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recording ? 'Stop recording' : 'Record a voice message'}
            onPress={toggleMic}
            disabled={!canRecord && !recording}
            style={({ pressed }) => [
              styles.mic,
              recording && styles.micActive,
              !canRecord && !recording && styles.micDisabled,
              pressed && styles.chipPressed,
            ]}
            testID="chat-mic"
          >
            <Ionicons
              name={recording ? 'stop' : 'mic'}
              size={22}
              color={recording ? theme.color.loss : theme.color.text}
            />
          </Pressable>
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
    voiceStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.two,
      paddingTop: t.space.two,
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
    // Same 44px height as the input and the Send button, so the row lines up.
    mic: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.lg,
      borderWidth: 1,
      borderColor: t.color.borderStrong,
      backgroundColor: t.color.bgSunken,
    },
    micActive: {
      borderColor: t.color.loss,
      backgroundColor: t.color.lossSoft,
    },
    micDisabled: {
      opacity: 0.4,
    },
    plus: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.lg,
      borderWidth: 1,
      borderColor: t.color.borderStrong,
      backgroundColor: t.color.bgSunken,
    },
    attachedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.two,
      paddingTop: t.space.two,
    },
    attachedName: {
      flexShrink: 1,
    },
    saveRow: {
      flexDirection: 'row',
      paddingTop: t.space.two,
    },
    confirm: {
      gap: t.space.one,
      marginTop: t.space.two,
      paddingTop: t.space.two,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.color.border,
    },
    confirmButtons: {
      flexDirection: 'row',
      gap: t.space.two,
      paddingTop: t.space.one,
    },
  });
