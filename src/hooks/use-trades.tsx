/**
 * Trade data for every screen that renders it.
 *
 * The dashboard, trades table, calendar and detail sheet all need the same
 * shape: trades joined to their moods with an effective P/L attached. Each
 * screen used to run its own copy of that two-query join; this hook is the one
 * implementation. `motion_flag` is selected here (the older per-screen queries
 * omitted it) because the detail sheet surfaces it.
 *
 * Not the only reader of the table, despite what this comment used to claim.
 * `src/lib/trade-context.ts` fetches the same rows for the Chat briefing, and
 * has to: that path runs once when a message is sent, not on render, so it
 * cannot be a hook. Both draw their column lists from `trade-table.ts` so the
 * two cannot disagree about what a trade is — see the note there for the bug
 * that made the split visible.
 *
 * ## Why this is a provider and not just a hook
 *
 * It was a plain hook, and four screens called it — dashboard, trades, calendar,
 * reports. Expo Router keeps visited tabs mounted, so all four copies ran at
 * once, and navigating to the second one threw:
 *
 *     cannot add `postgres_changes` callbacks for realtime:trades-live
 *     after `subscribe()`
 *
 * `supabase.channel(topic)` returns the *existing* channel when one with that
 * topic is already registered rather than creating a fresh one (realtime-js
 * 2.112.2, `RealtimeClient.channel`), and `.on()` on an already-subscribed
 * channel throws. With a fixed topic the first screen to mount won the channel
 * and every later one crashed — the dashboard looked fine while the other three
 * were dead.
 *
 * One provider is the fix, and it buys more than the crash: four copies also
 * meant four sockets and four identical query pairs, so a single inserted trade
 * fired four reloads and eight round trips.
 */

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';

import { describeLoadError } from '@/lib/load-errors';
import { supabase } from '@/lib/supabase';
import { effectiveProfitLoss, hasStoredProfitLoss } from '@/lib/trade-math';
import { FULL_TRADE_COLUMNS, type TradeRow } from '@/lib/trade-table';

/**
 * Realtime inserts arrive one per deal, and closing three positions at once
 * means three events inside a few milliseconds. Reloading on each would fire
 * three round trips to render the same final list, so the events are collapsed
 * into one reload.
 */
const RELOAD_DEBOUNCE_MS = 400;

/**
 * Fallback poll, used only while the realtime channel is not subscribed.
 *
 * Realtime needs `trades` added to the `supabase_realtime` publication
 * (`scripts/enable-realtime.sql`). Until that runs — or on a network that blocks
 * WebSockets — trades would otherwise only appear on a manual pull. A minute is
 * slow enough to be invisible on the connection and fast enough that a trade
 * closed on the desktop terminal is on the phone before the user looks.
 */
const POLL_INTERVAL_MS = 60_000;

/**
 * Channel topics run `trades-live-1`, `-2`, and so on: unique per effect run,
 * never reused.
 *
 * A fixed topic is what caused the crash described at the top of this file, and
 * a single provider does not on its own close the hole. `removeChannel` is async
 * and awaits a round trip to the server before the channel leaves the client's
 * list (`removeChannel` → `teardown` → `_remove`), while a React cleanup is
 * synchronous and cannot await anything. So a StrictMode double invoke, a fast
 * remount or a hot reload can all re-enter the effect while the old channel is
 * still registered, and a fixed topic would hand that subscribed channel
 * straight back. A fresh topic each time cannot collide.
 */
const CHANNEL_PREFIX = 'trades-live-';
let channelCounter = 0;

type RawTrade = {
  id: number;
  pair: string;
  direction: 'buy' | 'sell';
  entry_price: number;
  exit_price: number;
  size: number;
  setup_type: string | null;
  notes: string | null;
  profit_loss: number | null;
  created_at: string;
  source: string | null;
  external_id: string | null;
  account_login: string | null;
  opened_at: string | null;
  closed_at: string | null;
  commission: number | null;
  swap: number | null;
};

type RawMood = {
  trade_id: number;
  mood_tag: string | null;
  motion_flag: string | null;
};

export type LoadedTrade = TradeRow & {
  /** True when P/L was derived from prices because the column was NULL. */
  derived: boolean;
};

export type UseTradesResult = {
  trades: LoadedTrade[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** Silent reload, for pull-to-refresh and post-insert refresh. */
  refresh: () => Promise<void>;
  /**
   * True while the realtime channel is connected, so a screen can say whether
   * new trades are arriving by themselves or on a one-minute poll.
   */
  live: boolean;
};

const TRADE_COLUMNS = FULL_TRADE_COLUMNS;

const TradesContext = createContext<UseTradesResult | null>(null);

/**
 * The shared trade list. Same return shape as the old standalone hook, so the
 * four screens calling it did not have to change.
 */
export function useTrades(): UseTradesResult {
  const value = use(TradesContext);

  if (!value) {
    throw new Error('useTrades must be used inside <TradesProvider>');
  }

  return value;
}

export function TradesProvider({ children }: PropsWithChildren) {
  const [trades, setTrades] = useState<LoadedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);

      const { data: tradeData, error: tradeError } = await supabase
        .from('trades')
        .select(TRADE_COLUMNS)
        .order('created_at', { ascending: false });

      if (tradeError) {
        throw tradeError;
      }

      const rows = (tradeData as RawTrade[]) ?? [];

      // Moods live in their own table keyed by trade_id, and one trade can
      // carry several. Fetch them for every trade rather than the visible
      // page: the mood insight analyses the whole history.
      const moodsByTrade = new Map<number, string[]>();
      const motionByTrade = new Map<number, string>();

      if (rows.length > 0) {
        const { data: moodData, error: moodError } = await supabase
          .from('moods')
          .select('trade_id, mood_tag, motion_flag')
          .in(
            'trade_id',
            rows.map((row) => row.id),
          );

        if (moodError) {
          throw moodError;
        }

        for (const mood of (moodData as RawMood[]) ?? []) {
          if (mood.mood_tag) {
            const existing = moodsByTrade.get(mood.trade_id) ?? [];
            existing.push(mood.mood_tag);
            moodsByTrade.set(mood.trade_id, existing);
          }
          // First non-null wins: a trade normally has one motion reading, and
          // on web there is no accelerometer so this stays undefined.
          if (mood.motion_flag && !motionByTrade.has(mood.trade_id)) {
            motionByTrade.set(mood.trade_id, mood.motion_flag);
          }
        }
      }

      setTrades(
        rows.map((row) => ({
          ...row,
          // Rows written before the broker-sync migration have no source at
          // all; they were all typed into the Add Trade form, so treat a
          // missing value as manual rather than showing them as synced.
          source: row.source ?? 'manual',
          pl: effectiveProfitLoss(row),
          derived: !hasStoredProfitLoss(row),
          moods: moodsByTrade.get(row.id) ?? [],
          motion_flag: motionByTrade.get(row.id) ?? null,
        })),
      );
    } catch (err) {
      console.error(err);
      setError(describeLoadError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
  }, [load]);

  // Held in a ref so the debounce survives re-renders and can be cancelled on
  // unmount — a timer left running would call setState on a dead component.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) {
      clearTimeout(reloadTimer.current);
    }
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      load();
    }, RELOAD_DEBOUNCE_MS);
  }, [load]);

  /**
   * Live updates.
   *
   * This is what makes an imported trade appear on its own: the MT5 advisor
   * writes to `trades` over PostgREST from the user's own machine, and without a
   * subscription the app has no idea it happened until someone pulls to refresh.
   *
   * `postgres_changes` runs through the same RLS policies as the REST calls, so
   * a subscription without a `user_id` filter still only delivers this user's
   * rows — there is nothing to leak by leaving the filter off, and leaving it off
   * means the channel does not have to wait on the session to be read first.
   *
   * `moods` is on the same channel because tagging on one device should update
   * the untagged count on another, and a second table on an existing socket
   * costs nothing.
   */
  useEffect(() => {
    // A hot reload swaps this module in without running the old cleanup, and
    // `removeChannel` may not have finished unregistering the previous channel
    // either. Either way a socket would be left open, so sweep anything still
    // carrying this prefix before opening a new one. Safe precisely because one
    // provider means no other legitimate channel shares it.
    for (const stale of supabase.getChannels()) {
      if (stale.topic.startsWith(`realtime:${CHANNEL_PREFIX}`)) {
        supabase.removeChannel(stale);
      }
    }

    channelCounter += 1;

    const channel = supabase
      .channel(`${CHANNEL_PREFIX}${channelCounter}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moods' }, scheduleReload)
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED');
      });

    return () => {
      if (reloadTimer.current) {
        clearTimeout(reloadTimer.current);
        reloadTimer.current = null;
      }
      // Not awaited, and cannot be — React cleanups are synchronous. The unique
      // topic above is what makes that safe.
      supabase.removeChannel(channel);
      setLive(false);
    };
  }, [scheduleReload]);

  // Poll only while the socket is down, so the normal case costs one WebSocket
  // and no requests at all.
  useEffect(() => {
    if (live) {
      return;
    }

    const timer = setInterval(() => {
      load();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [live, load]);

  // Coming back to the app is the moment the list is most likely to be stale —
  // and on iOS the socket is suspended in the background, so events that arrived
  // while the phone was locked were never delivered.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        load();
      }
    });

    return () => subscription.remove();
  }, [load]);

  const value = useMemo<UseTradesResult>(
    () => ({ trades, loading, refreshing, error, refresh, live }),
    [trades, loading, refreshing, error, refresh, live],
  );

  return <TradesContext.Provider value={value}>{children}</TradesContext.Provider>;
}

/**
 * Cumulative P/L over time, oldest to newest — the equity curve series.
 *
 * `useTrades` returns newest-first (the table's default order), so this sorts
 * ascending before running the total.
 */
export function buildEquitySeries(
  trades: { created_at: string; pl: number }[],
): { t: number; equity: number }[] {
  let running = 0;
  return [...trades]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .map((trade) => {
      running += trade.pl;
      return { t: Date.parse(trade.created_at), equity: running };
    });
}
