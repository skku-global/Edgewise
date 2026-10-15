/**
 * Voice that survives having no internet.
 *
 * Writing speech down needs Gemini, which needs internet. Recording does not.
 * So when a recording cannot be sent, it is kept here (a copy of the file on the
 * phone, or the audio text on the web) and written out later, when you are
 * online, with the "Write them out" button.
 *
 *   transcribeOrQueue(uri)  -> { text } if online, { queued: true } if not
 *   transcribeQueued()      -> writes out everything waiting
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { audioMime, OfflineError, transcribeBlob, transcribeRecording } from '@/lib/voice';

const KEY = 'edgewise.voicequeue.v1';
const MAX_CLIPS = 10;
const WEB_MAX_BYTES = 1_500_000;

type Clip = {
  id: string;
  savedAt: string;
  mime: string;
  /** phone: a copy of the recording on the phone */
  uri?: string;
  /** web: the audio as base64 text */
  data?: string;
};

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/** Calls `fn` whenever the number of waiting clips changes. Returns an unsubscribe function. */
export function subscribeQueue(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

async function readClips(): Promise<Clip[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Clip[]) : [];
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function writeClips(clips: Clip[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(clips));
  notify();
}

export async function queueCount(): Promise<number> {
  return (await readClips()).length;
}

/** Keeps the recording so it can be written out later. */
export async function saveClip(uri: string): Promise<void> {
  const clips = await readClips();
  if (clips.length >= MAX_CLIPS) {
    throw new Error(`${MAX_CLIPS} voice notes are already waiting. Write them out first.`);
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const savedAt = new Date().toISOString();

  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    if (blob.size === 0) {
      throw new Error('The recording was empty. Hold the mic a little longer.');
    }
    if (blob.size > WEB_MAX_BYTES) {
      throw new Error('That recording is too long to keep offline in the browser. Make it shorter.');
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not keep that recording.'));
      reader.readAsDataURL(blob);
    });
    clips.push({
      id,
      savedAt,
      mime: audioMime(blob),
      data: dataUrl.slice(dataUrl.indexOf(',') + 1),
    });
  } else {
    // The recorder's own file lives in a cache the phone may clear. Copy it somewhere safe.
    const dir = `${FileSystem.documentDirectory}voice-queue/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
    const dest = `${dir}${id}.m4a`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    clips.push({ id, savedAt, mime: 'audio/m4a', uri: dest });
  }

  await writeClips(clips);
}

async function clipBlob(clip: Clip): Promise<Blob> {
  if (clip.uri) {
    return (await fetch(clip.uri)).blob();
  }
  return (await fetch(`data:${clip.mime};base64,${clip.data ?? ''}`)).blob();
}

async function removeClip(clip: Clip): Promise<void> {
  if (clip.uri) {
    await FileSystem.deleteAsync(clip.uri, { idempotent: true }).catch(() => undefined);
  }
  const rest = (await readClips()).filter((c) => c.id !== clip.id);
  await writeClips(rest);
}

/** Online: words. Offline: the recording is kept and `queued` is true. */
export async function transcribeOrQueue(
  uri: string,
): Promise<{ text: string; queued?: false } | { text?: undefined; queued: true }> {
  try {
    return { text: await transcribeRecording(uri) };
  } catch (err) {
    if (err instanceof OfflineError) {
      await saveClip(uri);
      return { queued: true };
    }
    throw err;
  }
}

export type QueueResult = {
  /** The words, oldest recording first. */
  texts: string[];
  /** Recordings that could not be understood and were dropped. */
  failed: number;
  /** Recordings still waiting (still offline). */
  left: number;
};

/** Writes out every waiting recording. Stops quietly if the internet is still down. */
export async function transcribeQueued(): Promise<QueueResult> {
  const texts: string[] = [];
  let failed = 0;

  for (const clip of await readClips()) {
    try {
      texts.push(await transcribeBlob(await clipBlob(clip), clip.mime));
      await removeClip(clip);
    } catch (err) {
      if (err instanceof OfflineError) {
        break;
      }
      // Silent or broken recording: drop it so it cannot block the rest forever.
      console.error(err);
      failed += 1;
      await removeClip(clip);
    }
  }
  return { texts, failed, left: await queueCount() };
}
