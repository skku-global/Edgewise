/**
 * Tests for the shared number formatters.
 *
 * Small functions, but every screen renders through them, so a change here is
 * visible everywhere at once. The sign rules are the substance: a win must read
 * as `+2.00`, a drawdown must not read as `-40.00`, and an undefined ratio must
 * not read as `Infinity`.
 */

import {
  formatAmount,
  formatPrice,
  formatRatio,
  formatShortDate,
  formatSigned,
} from '../format';

describe('formatSigned', () => {
  it('marks a gain with an explicit plus', () => {
    expect(formatSigned(2)).toBe('+2.00');
    expect(formatSigned(1234.5)).toBe('+1234.50');
  });

  it('marks a loss with a minus', () => {
    expect(formatSigned(-2)).toBe('-2.00');
  });

  it('leaves a scratch unsigned', () => {
    expect(formatSigned(0)).toBe('0.00');
  });

  it('does not print a negative zero', () => {
    expect(formatSigned(-0)).toBe('0.00');
  });

  it('always shows two decimals', () => {
    expect(formatSigned(0.005)).toBe('+0.01');
  });

  it('keeps the sign on a loss too small to show', () => {
    // Sub-cent losses print as "-0.00", which is odd but honest: the sign is
    // read off the value, not off the rounded string, so a losing trade never
    // renders as a win.
    expect(formatSigned(-0.004)).toBe('-0.00');
  });
});

describe('formatPrice', () => {
  it('keeps whole numbers whole', () => {
    expect(formatPrice(100)).toBe('100');
  });

  it('rounds fractional prices to two decimals', () => {
    expect(formatPrice(1.23456)).toBe('1.23');
    expect(formatPrice(1.5)).toBe('1.50');
  });
});

describe('formatAmount', () => {
  it('drops the sign, so a drawdown does not read as a further loss', () => {
    expect(formatAmount(-40)).toBe('40.00');
    expect(formatAmount(40)).toBe('40.00');
  });
});

describe('formatRatio', () => {
  it('prints two decimals', () => {
    expect(formatRatio(1.5)).toBe('1.50');
  });

  it('refuses to invent a number when the ratio is undefined', () => {
    // Profit factor with no losing trades. "∞" off a three-trade winning
    // streak would be the most misleading figure the app could show.
    expect(formatRatio(null)).toBe('—');
  });
});

describe('formatShortDate', () => {
  it('renders a month and day', () => {
    // Built from local parts so the assertion does not depend on the machine's
    // timezone shifting the date across midnight.
    expect(formatShortDate(new Date(2026, 7, 10, 12, 0).toISOString())).toBe('Aug 10');
  });
});
