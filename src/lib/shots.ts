/**
 * Screenshot management for Trade Journal V2.
 *
 * Handles picking, resizing to max 1280px, WebP compression, hashing,
 * uploading to Supabase Storage ('shots' bucket), tracking in `entry_shots`,
 * and signed URL retrieval.
 */

import * as DocumentPicker from 'expo-document-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';

export type ShotPhase = 'before' | 'during' | 'after';

export type EntryShot = {
  id: number;
  user_id: string;
  entry_id: number | null;
  trade_id: number | null;
  phase: ShotPhase;
  path: string;
  bytes: number;
  ai_read: Record<string, unknown> | null;
  content_hash: string | null;
  created_at: string;
  signed_url?: string | null;
};

/* ------------------------------------------------------------------ */
/* Pure JS SHA-256 Implementation (Synchronous, zero-dependency)       */
/* ------------------------------------------------------------------ */

function sha256(input: Uint8Array): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const l = input.length * 8;
  const k = ((448 - ((l + 8) % 512)) + 512) % 512;
  const totalLength = (l + 8 + k + 64) / 8;
  const msg = new Uint8Array(totalLength);
  msg.set(input);
  msg[input.length] = 0x80;

  const view = new DataView(msg.buffer);
  view.setBigUint64(totalLength - 8, BigInt(l));

  const W = new Uint32Array(64);

  for (let i = 0; i < totalLength; i += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] = view.getUint32(i + t * 4);
    }
    for (let t = 16; t < 64; t++) {
      const s0 =
        ((W[t - 15] >>> 7) | (W[t - 15] << 25)) ^
        ((W[t - 15] >>> 18) | (W[t - 15] << 14)) ^
        (W[t - 15] >>> 3);
      const s1 =
        ((W[t - 2] >>> 17) | (W[t - 2] << 15)) ^
        ((W[t - 2] >>> 19) | (W[t - 2] << 13)) ^
        (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }

    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];
    let f = H[5];
    let g = H[6];
    let h = H[7];

    for (let t = 0; t < 64; t++) {
      const S1 =
        ((e >>> 6) | (e << 26)) ^
        ((e >>> 11) | (e << 21)) ^
        ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 =
        ((a >>> 2) | (a << 30)) ^
        ((a >>> 13) | (a << 19)) ^
        ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return H.map((val) => val.toString(16).padStart(8, '0')).join('');
}

function decodeBase64(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const buffer: number[] = [];
  let bits = 0;
  let bitCount = 0;
  for (let i = 0; i < base64.length; i++) {
    const char = base64[i];
    if (char === '=') break;
    const index = chars.indexOf(char);
    if (index === -1) continue;
    bits = (bits << 6) | index;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      buffer.push((bits >> bitCount) & 0xff);
    }
  }
  return new Uint8Array(buffer);
}

/* ------------------------------------------------------------------ */
/* Image Picking & Processing                                         */
/* ------------------------------------------------------------------ */

export async function pickShotImage(): Promise<{ uri: string; name: string } | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: 'image/*',
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.length) {
    return null;
  }
  const asset = picked.assets[0];
  return {
    uri: asset.uri,
    name: asset.name ?? 'screenshot',
  };
}

export type ProcessedImage = {
  uri: string;
  width: number;
  height: number;
  base64: string;
  bytes: number;
  hash: string;
  binary: Uint8Array;
};

/**
 * Resizes the image to max 1280px in either dimension, compresses to WebP (~0.7 quality),
 * and computes its SHA-256 content hash.
 */
export async function processShotImage(uri: string): Promise<ProcessedImage> {
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: 1280 } }],
    { compress: 0.7, format: SaveFormat.WEBP, base64: true }
  );

  const base64 = result.base64 ?? '';
  const binary = decodeBase64(base64);
  const hash = sha256(binary);

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    base64,
    bytes: binary.length,
    hash,
    binary,
  };
}

/* ------------------------------------------------------------------ */
/* Storage & Database Operations                                      */
/* ------------------------------------------------------------------ */

export async function countShots(params: { entryId?: number | null; tradeId?: number | null }): Promise<number> {
  const { entryId, tradeId } = params;
  if (!entryId && !tradeId) return 0;

  let query = supabase.from('entry_shots').select('*', { count: 'exact', head: true });
  if (entryId) {
    query = query.eq('entry_id', entryId);
  } else if (tradeId) {
    query = query.eq('trade_id', tradeId);
  }

  const { count, error } = await query;
  if (error) {
    console.error('countShots error:', error);
    return 0;
  }
  return count ?? 0;
}

export async function uploadShot(params: {
  uri: string;
  phase: ShotPhase;
  entryId?: number | null;
  tradeId?: number | null;
  aiRead?: Record<string, unknown> | null;
}): Promise<EntryShot> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error('You must be signed in to upload trade screenshots.');
  }
  const userId = authData.user.id;

  const currentCount = await countShots({ entryId: params.entryId, tradeId: params.tradeId });
  if (currentCount >= 5) {
    throw new Error('Maximum of 5 screenshots reached for this trade.');
  }

  const processed = await processShotImage(params.uri);

  const folder = params.entryId ? `entry_${params.entryId}` : `trade_${params.tradeId}`;
  const path = `${userId}/${folder}/${Date.now()}_${processed.hash.slice(0, 8)}.webp`;

  const { error: uploadError } = await supabase.storage
    .from('shots')
    .upload(path, processed.binary, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { data: row, error: insertError } = await supabase
    .from('entry_shots')
    .insert([
      {
        user_id: userId,
        entry_id: params.entryId ?? null,
        trade_id: params.tradeId ?? null,
        phase: params.phase,
        path,
        bytes: processed.bytes,
        ai_read: params.aiRead ?? null,
        content_hash: processed.hash,
      },
    ])
    .select()
    .single();

  if (insertError) {
    throw new Error(`Saving screenshot record failed: ${insertError.message}`);
  }

  const { data: urlData } = await supabase.storage.from('shots').createSignedUrl(path, 3600);

  return {
    id: Number(row.id),
    user_id: String(row.user_id),
    entry_id: row.entry_id ? Number(row.entry_id) : null,
    trade_id: row.trade_id ? Number(row.trade_id) : null,
    phase: row.phase as ShotPhase,
    path: String(row.path),
    bytes: Number(row.bytes),
    ai_read: (row.ai_read as Record<string, unknown> | null) ?? null,
    content_hash: row.content_hash ? String(row.content_hash) : null,
    created_at: String(row.created_at),
    signed_url: urlData?.signedUrl ?? null,
  };
}

export async function listShots(params: {
  entryId?: number | null;
  tradeId?: number | null;
}): Promise<EntryShot[]> {
  const { entryId, tradeId } = params;
  if (!entryId && !tradeId) return [];

  let query = supabase.from('entry_shots').select('*').order('created_at', { ascending: true });
  if (entryId && tradeId) {
    query = query.or(`entry_id.eq.${entryId},trade_id.eq.${tradeId}`);
  } else if (entryId) {
    query = query.eq('entry_id', entryId);
  } else if (tradeId) {
    query = query.eq('trade_id', tradeId);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error('listShots error:', error);
    return [];
  }

  const paths = data.map((r) => String(r.path));
  let signedUrls: Record<string, string> = {};
  if (paths.length > 0) {
    const { data: urlData } = await supabase.storage.from('shots').createSignedUrls(paths, 3600);
    if (urlData) {
      signedUrls = Object.fromEntries(
        urlData.filter((u) => u.signedUrl && u.path).map((u) => [u.path, u.signedUrl])
      );
    }
  }

  return data.map((row) => ({
    id: Number(row.id),
    user_id: String(row.user_id),
    entry_id: row.entry_id ? Number(row.entry_id) : null,
    trade_id: row.trade_id ? Number(row.trade_id) : null,
    phase: row.phase as ShotPhase,
    path: String(row.path),
    bytes: Number(row.bytes),
    ai_read: (row.ai_read as Record<string, unknown> | null) ?? null,
    content_hash: row.content_hash ? String(row.content_hash) : null,
    created_at: String(row.created_at),
    signed_url: signedUrls[String(row.path)] ?? null,
  }));
}

export async function deleteShot(id: number, path: string): Promise<void> {
  await supabase.storage.from('shots').remove([path]);
  const { error } = await supabase.from('entry_shots').delete().eq('id', id);
  if (error) {
    throw error;
  }
}

export async function getCachedAiReading(hash: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('entry_shots')
    .select('ai_read')
    .eq('content_hash', hash)
    .not('ai_read', 'is', null)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return (data.ai_read as Record<string, unknown>) ?? null;
}

export async function saveCachedAiReading(hash: string, aiRead: Record<string, unknown>): Promise<void> {
  await supabase
  .from('entry_shots')
  .update({ ai_read: aiRead })
  .eq('content_hash', hash);
}

export async function pickAndUploadShot(params: {
  phase: ShotPhase;
  entryId?: number | null;
  tradeId?: number | null;
}): Promise<EntryShot | null> {
  const picked = await pickShotImage();
  if (!picked) return null;
  return await uploadShot({
    uri: picked.uri,
    phase: params.phase,
    entryId: params.entryId,
    tradeId: params.tradeId,
  });
}
