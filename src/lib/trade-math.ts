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
