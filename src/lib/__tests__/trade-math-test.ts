/**
 * Tests for the direction-aware P/L helpers.
 *
 * The sell case is the reason this module exists: `exit - entry` is right for a
 * long and backwards for a short, and getting it wrong turns a profitable
 * short-selling month into a losing one on every screen at once.
 */

import { computeProfitLoss, effectiveProfitLoss, hasStoredProfitLoss } from '../trade-math';

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
