/**
 * Lot size for a fixed amount of risk.
 *
 *   lots = risk in dollars / (distance from entry to stop x dollars per 1.00 of price move per lot)
 *
 * This is plain arithmetic on purpose. A wrong lot size costs real money, so the
 * AI is never asked to do the maths.
 *
 * "Dollars per 1.00 of price move, per 1 lot" depends on your broker's contract
 * size, so the app does not guess it. It is taken from, in this order:
 *   1. a value you typed and saved for that pair
 *   2. learned from your own past trades on that pair (median of profit / (move x lots))
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

const KEY = 'edgewise.sizing.v1';

export type SizingSettings = {
  riskAmount: number | null;
  /** pair -> dollars per 1.00 price move per 1 lot */
  pointValues: Record<string, number>;
};

const EMPTY: SizingSettings = { riskAmount: null, pointValues: {} };

export async function loadSizing(): Promise<SizingSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SizingSettings>;
      return {
        riskAmount: typeof parsed.riskAmount === 'number' ? parsed.riskAmount : null,
        pointValues: parsed.pointValues && typeof parsed.pointValues === 'object' ? parsed.pointValues : {},
      };
    }
  } catch (err) {
    console.error(err);
  }
  return EMPTY;
}

export async function saveSizing(settings: SizingSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(settings));
  } catch (err) {
    console.error(err);
  }
}

/** Learns the per-lot value from past trades on this pair. Needs at least 3. */
export async function learnPointValue(pair: string): Promise<{ value: number; count: number } | null> {
  const { data, error } = await supabase
    .from('trades')
    .select('entry_price, exit_price, size, profit_loss')
    .eq('pair', pair.trim().toUpperCase())
    .limit(60);
  if (error || !data) {
    return null;
  }

  const ratios = (data as Record<string, unknown>[])
    .map((row) => {
      const move = Math.abs(Number(row.exit_price) - Number(row.entry_price));
      const size = Number(row.size);
      const pl = Math.abs(Number(row.profit_loss));
      return move > 0 && size > 0 ? pl / (move * size) : NaN;
    })
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  if (ratios.length < 3) {
    return null;
  }
  const mid = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  return { value: median, count: ratios.length };
}

export type PointValue = { value: number; source: 'saved' | 'learned'; count?: number };

export async function resolvePointValue(
  pair: string,
  settings: SizingSettings,
): Promise<PointValue | null> {
  const key = pair.trim().toUpperCase();
  const saved = settings.pointValues[key];
  if (saved && saved > 0) {
    return { value: saved, source: 'saved' };
  }
  const learned = await learnPointValue(key);
  return learned ? { value: learned.value, source: 'learned', count: learned.count } : null;
}

export type LotResult = {
  /** Rounded DOWN to 0.01, so you never risk more than the amount. 0 = even 0.01 is too much. */
  lots: number;
  exact: number;
  riskAtLots: number;
  riskAtMinLot: number;
};

export function calcLots(input: {
  risk: number;
  entry: number;
  stop: number;
  valuePerUnit: number;
}): LotResult | null {
  const distance = Math.abs(input.entry - input.stop);
  if (!(input.risk > 0) || !(input.valuePerUnit > 0) || !(distance > 0)) {
    return null;
  }
  const exact = input.risk / (distance * input.valuePerUnit);
  const lots = Math.floor(exact * 100 + 1e-9) / 100;
  return {
    lots,
    exact,
    riskAtLots: lots * distance * input.valuePerUnit,
    riskAtMinLot: 0.01 * distance * input.valuePerUnit,
  };
}

/** What a given lot size would lose if the stop is hit. */
export function riskOf(lots: number, entry: number, stop: number, valuePerUnit: number): number {
  return lots * Math.abs(entry - stop) * valuePerUnit;
}
