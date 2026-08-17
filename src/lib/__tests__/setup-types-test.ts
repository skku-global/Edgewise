/**
 * Tests for setup-type normalisation.
 *
 * `setup_type` was free text before the dropdown existed, so the live table
 * holds near-miss variants. What matters here is the pair of decisions the
 * module makes about them: recognised spellings collapse onto one canonical
 * label so the Pattern Engine can group them, and unrecognised ones return null
 * rather than being swept into "Other" — a typo stays visible and fixable
 * instead of quietly joining a bucket it does not belong in.
 */

import {
  SETUP_TYPES,
  displaySetup,
  normalizeSetup,
  setupFilterOptions,
} from '../setup-types';

describe('normalizeSetup', () => {
  it('passes the canonical labels through unchanged', () => {
    for (const setup of SETUP_TYPES) {
      expect(normalizeSetup(setup)).toBe(setup);
    }
  });

  it('ignores case and surrounding whitespace', () => {
    expect(normalizeSetup('  breakout ')).toBe('Breakout');
    expect(normalizeSetup('TREND CONTINUATION')).toBe('Trend continuation');
  });

  it('collapses the punctuation variants onto one label', () => {
    for (const raw of ['break-out', 'Break Out', 'Break_Out', 'breakouts', 'BO']) {
      expect(normalizeSetup(raw)).toBe('Breakout');
    }
  });

  it('maps the other known aliases', () => {
    expect(normalizeSetup('pb')).toBe('Pullback');
    expect(normalizeSetup('retracement')).toBe('Pullback');
    expect(normalizeSetup('reverse')).toBe('Reversal');
    expect(normalizeSetup('continuation')).toBe('Trend continuation');
    expect(normalizeSetup('trend-follow')).toBe('Trend continuation');
  });

  it('returns null for anything it cannot place', () => {
    expect(normalizeSetup('liquidity sweep')).toBeNull();
    expect(normalizeSetup('???')).toBeNull();
  });

  it('returns null for absent values', () => {
    expect(normalizeSetup(null)).toBeNull();
    expect(normalizeSetup(undefined)).toBeNull();
    expect(normalizeSetup('')).toBeNull();
  });
});

describe('displaySetup', () => {
  it('shows the canonical label when there is one', () => {
    expect(displaySetup('bo')).toBe('Breakout');
  });

  it('shows the raw text when there is not, so a typo stays visible', () => {
    expect(displaySetup('  liquidity sweep ')).toBe('liquidity sweep');
  });

  it('shows an em dash for no setup', () => {
    expect(displaySetup(null)).toBe('—');
    expect(displaySetup('   ')).toBe('—');
  });
});

describe('setupFilterOptions', () => {
  it('always offers the canonical list', () => {
    expect(setupFilterOptions([])).toEqual([...SETUP_TYPES]);
  });

  it('does not add an extra option for a value it can normalise', () => {
    expect(setupFilterOptions(['bo', 'BREAKOUT', 'pb'])).toEqual([...SETUP_TYPES]);
  });

  it('appends unmatched values so legacy rows stay reachable', () => {
    expect(setupFilterOptions(['liquidity sweep', 'bo', 'ict silver bullet'])).toEqual([
      ...SETUP_TYPES,
      'ict silver bullet',
      'liquidity sweep',
    ]);
  });

  it('de-duplicates and trims the extras', () => {
    const options = setupFilterOptions(['  gap fill', 'gap fill', null, undefined, '  ']);
    expect(options).toEqual([...SETUP_TYPES, 'gap fill']);
  });
});
