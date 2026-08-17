/**
 * Tests for the tagging queue.
 *
 * The exclusion rules are the whole behaviour. Manual trades are left out
 * because the Add Trade form already asked for a mood, so a manual row without
 * one is a deliberate skip — prompting about it would be pestering. Imported
 * trades are included because nobody was asked.
 */

import { makeImported, makeTrade } from '../__fixtures__/trade';
import {
  isImported,
  tagPromptLabel,
  unclassifiedTrades,
  untaggedTrades,
} from '../untagged';

describe('isImported', () => {
  it('treats anything other than manual as imported', () => {
    expect(isImported({ source: 'mt5' })).toBe(true);
    expect(isImported({ source: 'ctrader' })).toBe(true);
    // An unknown future source counts as imported rather than manual: a broker
    // this app has not heard of still did not ask the user how they felt.
    expect(isImported({ source: 'some-new-broker' })).toBe(true);
  });

  it('treats manual as not imported', () => {
    expect(isImported({ source: 'manual' })).toBe(false);
  });
});

describe('untaggedTrades', () => {
  it('returns imported trades with no mood', () => {
    const target = makeImported({ id: 1 });
    const queue = untaggedTrades([target, makeImported({ id: 2, moods: ['calm'] })]);
    expect(queue.map((t) => t.id)).toEqual([1]);
  });

  it('leaves manual trades alone even when they have no mood', () => {
    expect(untaggedTrades([makeTrade({ moods: [] })])).toEqual([]);
  });

  it('orders newest first, because recall decays', () => {
    const queue = untaggedTrades([
      makeImported({ id: 1, created_at: '2026-06-01T00:00:00.000Z' }),
      makeImported({ id: 2, created_at: '2026-08-14T00:00:00.000Z' }),
      makeImported({ id: 3, created_at: '2026-07-15T00:00:00.000Z' }),
    ]);
    expect(queue.map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it('returns an empty queue for an empty history', () => {
    expect(untaggedTrades([])).toEqual([]);
  });
});

describe('unclassifiedTrades', () => {
  it('returns imported trades with no setup', () => {
    const queue = unclassifiedTrades([
      makeImported({ id: 1, setup_type: null }),
      makeImported({ id: 2, setup_type: 'Breakout' }),
      makeTrade({ id: 3, setup_type: null }),
    ]);
    expect(queue.map((t) => t.id)).toEqual([1]);
  });

  it('is tracked separately from mood — a trade can have one and not the other', () => {
    const trade = makeImported({ moods: ['calm'], setup_type: null });
    expect(untaggedTrades([trade])).toEqual([]);
    expect(unclassifiedTrades([trade])).toHaveLength(1);
  });
});

describe('tagPromptLabel', () => {
  it('says nothing when there is nothing to ask', () => {
    expect(tagPromptLabel([])).toBeNull();
    expect(tagPromptLabel([makeImported({ moods: ['calm'] })])).toBeNull();
    expect(tagPromptLabel([makeTrade()])).toBeNull();
  });

  it('uses the singular for one trade', () => {
    expect(tagPromptLabel([makeImported()])).toBe('1 synced trade needs a mood');
  });

  it('uses the plural beyond one', () => {
    expect(tagPromptLabel([makeImported(), makeImported(), makeImported()])).toBe(
      '3 synced trades need a mood',
    );
  });
});
