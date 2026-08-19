/**
 * Direction-aware trade profit/loss shared by the trades screen (where the
 * stored `profit_loss` column is still NULL, so every row derives) and the
 * dashboard (which prefers the stored value and falls back to deriving).
 *
 * Buying 100 and selling 110 makes money; selling 100 and covering at 110
 * loses money — the naive `exit - entry` formula gets that backwards, so the
 * sign is flipped for sell trades.
 */
export function computeProfitLoss(trade: {
  direction: 'buy' | 'sell';
  entry_price: number;
  exit_price: number;
  size: number;
}) {
  const { direction, entry_price, exit_price, size } = trade;
  const priceDiff = direction === 'buy' ? exit_price - entry_price : entry_price - exit_price;
  return priceDiff * size;
}

/**
 * Whether the stored `profit_loss` column is a real value (used for trading
 * screens that fall back to deriving when the column hasn't been populated).
 */
export function hasStoredProfitLoss(trade: { profit_loss: number | null | undefined }) {
  return trade.profit_loss !== null && trade.profit_loss !== undefined;
}

/** Single source of truth for a trade's effective P/L. */
export function effectiveProfitLoss(trade: {
  direction: 'buy' | 'sell';
  entry_price: number;
  exit_price: number;
  size: number;
  profit_loss: number | null | undefined;
}) {
  if (hasStoredProfitLoss(trade)) {
    return trade.profit_loss as number;
  }
  return computeProfitLoss(trade);
}

/**
 * Split a trade's P/L into what the market gave and what the broker took.
 *
 * ## The direction of the arithmetic
 *
 * `profit_loss` on an imported row is already NET — `mt5-report.ts` stores
 * `profit + commission + swap`, and the advisor sends the same figure. So the
 * unknown here is GROSS, and it is recovered by *removing* the costs:
 *
 *     gross = net - commission - swap
 *
 * Getting that backwards is the easy mistake and a silent one: costs are stored
 * signed (negative when charged, and swap can be positive when a carry pays),
 * so `net + commission + swap` still returns a plausible-looking number — just
 * one that double-charges every fee. Hence one helper, used everywhere.
 *
 * ## Why null is not zero
 *
 * A manual row has no cost columns, and a report without a commission column
 * leaves them null. That is absent data, not a zero-fee trade, so `hasCosts` is
 * false and callers show the single net figure they always showed rather than a
 * breakdown asserting the broker charged nothing.
 */
export type TradeCosts = {
  /** P/L before broker costs. Equals `net` when no costs are recorded. */
  gross: number;
  /** As the broker signs it — negative when charged. */
  commission: number;
  /** Negative when charged, positive when an overnight carry pays. */
  swap: number;
  /** `commission + swap`. Negative when the broker took money overall. */
  total: number;
  /** What actually hit the account — the figure every other screen shows. */
  net: number;
  /** False when neither column holds a figure, so there is nothing to break down. */
  hasCosts: boolean;
};

export function tradeCosts(trade: {
  pl: number;
  commission: number | null | undefined;
  swap: number | null | undefined;
}): TradeCosts {
  const commission = trade.commission ?? 0;
  const swap = trade.swap ?? 0;
  const hasCosts =
    (trade.commission !== null && trade.commission !== undefined) ||
    (trade.swap !== null && trade.swap !== undefined);

  return {
    gross: trade.pl - commission - swap,
    commission,
    swap,
    total: commission + swap,
    net: trade.pl,
    hasCosts,
  };
}
