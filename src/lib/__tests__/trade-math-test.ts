/**
 * Tests for the direction-aware P/L helpers.
 *
 * The sell case is the reason this module exists: `exit - entry` is right for a
 * long and backwards for a short, and getting it wrong turns a profitable
 * short-selling month into a losing one on every screen at once.
 */

import { computeProfitLoss, effectiveProfitLoss, hasStoredProfitLoss, tradeCosts } from '../trade-math';

describe('computeProfitLoss', () => {
  it('profits when a long exits above entry', () => {
    expect(
      computeProfitLoss({ direction: 'buy', entry_price: 100, exit_price: 110, size: 1 }),
    ).toBe(10);
  });

  it('loses when a long exits below entry', () => {
    expect(
      computeProfitLoss({ direction: 'buy', entry_price: 100, exit_price: 90, size: 1 }),
    ).toBe(-10);
  });

  it('profits when a short exits below entry', () => {
    expect(
      computeProfitLoss({ direction: 'sell', entry_price: 100, exit_price: 90, size: 1 }),
    ).toBe(10);
  });

  it('loses when a short exits above entry', () => {
    expect(
      computeProfitLoss({ direction: 'sell', entry_price: 100, exit_price: 110, size: 1 }),
    ).toBe(-10);
  });

  it('scales by position size', () => {
    expect(
      computeProfitLoss({ direction: 'buy', entry_price: 100, exit_price: 101, size: 2.5 }),
    ).toBe(2.5);
  });

  it('returns zero for a scratch', () => {
    expect(
      computeProfitLoss({ direction: 'sell', entry_price: 100, exit_price: 100, size: 3 }),
    ).toBe(0);
  });
});

describe('hasStoredProfitLoss', () => {
  it.each([
    [42, true],
    [-42, true],
    // The one that a truthiness check gets wrong: a real, stored break-even.
    [0, true],
    [null, false],
    [undefined, false],
  ])('%p -> %p', (profit_loss, expected) => {
    expect(hasStoredProfitLoss({ profit_loss })).toBe(expected);
  });
});

describe('effectiveProfitLoss', () => {
  const trade = {
    direction: 'buy' as const,
    entry_price: 100,
    exit_price: 110,
    size: 1,
  };

  it('prefers the broker’s stored figure over the derived one', () => {
    // The stored value is net of commission and swap, so it is *supposed* to
    // disagree with the arithmetic. Preferring it is the point.
    expect(effectiveProfitLoss({ ...trade, profit_loss: 8.4 })).toBe(8.4);
  });

  it('honours a stored zero instead of falling back to arithmetic', () => {
    expect(effectiveProfitLoss({ ...trade, profit_loss: 0 })).toBe(0);
  });

  it('derives when nothing is stored', () => {
    expect(effectiveProfitLoss({ ...trade, profit_loss: null })).toBe(10);
    expect(effectiveProfitLoss({ ...trade, profit_loss: undefined })).toBe(10);
  });
});

describe('tradeCosts', () => {
  it('recovers gross by removing the costs from a net figure', () => {
    // The broker charged 3 in commission and 1.50 in swap, leaving 8.40. The
    // market therefore gave 12.90 — and the test states it as a subtraction,
    // because adding the signed costs instead is the plausible wrong answer.
    const costs = tradeCosts({ pl: 8.4, commission: -3, swap: -1.5 });

    expect(costs.gross).toBeCloseTo(12.9);
    expect(costs.net).toBe(8.4);
    expect(costs.total).toBeCloseTo(-4.5);
    expect(costs.hasCosts).toBe(true);
  });

  it('treats a positive swap as a credit, not another charge', () => {
    // A long carry can pay. Gross is then *below* net, which is the case a
    // sign-flipped implementation gets wrong while still looking sensible.
    const costs = tradeCosts({ pl: 10, commission: 0, swap: 2 });

    expect(costs.gross).toBe(8);
    expect(costs.total).toBe(2);
  });

  it('reports no costs for a manual row, and leaves gross equal to net', () => {
    const costs = tradeCosts({ pl: 10, commission: null, swap: null });

    expect(costs.hasCosts).toBe(false);
    expect(costs.gross).toBe(10);
    expect(costs.total).toBe(0);
  });

  it('counts a stored zero as a real reported figure', () => {
    // A commission-free account genuinely reports 0. That is data, and the
    // breakdown should render rather than being hidden as absent.
    expect(tradeCosts({ pl: 10, commission: 0, swap: null }).hasCosts).toBe(true);
    expect(tradeCosts({ pl: 10, commission: null, swap: 0 }).hasCosts).toBe(true);
  });

  it('handles one column present and the other missing', () => {
    const costs = tradeCosts({ pl: 7, commission: -3, swap: null });

    expect(costs.gross).toBe(10);
    expect(costs.commission).toBe(-3);
    expect(costs.swap).toBe(0);
    expect(costs.hasCosts).toBe(true);
  });

  it('surfaces a trade that was green on the chart and red in the account', () => {
    // The reading the detail sheet calls out, and the whole reason costs are
    // worth showing: nothing about a net of -0.60 says the entry was right.
    const costs = tradeCosts({ pl: -0.6, commission: -4, swap: -0.4 });

    expect(costs.gross).toBeCloseTo(3.8);
    expect(costs.net).toBeLessThan(0);
  });
});
