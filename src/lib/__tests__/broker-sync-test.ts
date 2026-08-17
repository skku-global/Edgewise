/**
 * Tests for the broker-sync helpers.
 *
 * The credential block gets the most attention here, because it is the one part
 * of the sync where being wrong is silent. A mistyped label produces a screen
 * that looks completely correct and instructions that cannot work, and nobody
 * finds out until a user has spent twenty minutes in MetaTrader. So one test
 * reads the advisor source and checks the labels against the inputs it actually
 * declares.
 */

import fs from 'fs';
import path from 'path';

import { eaSettings, relativeTime, syncStatus, EA_FILE_NAME } from '../broker-sync';
import { makeImported, makeTrade } from '../__fixtures__/trade';

const NOW = new Date('2026-08-15T12:00:00.000Z');

describe('eaSettings', () => {
  const settings = eaSettings({
    supabaseUrl: 'https://abc.supabase.co',
    supabaseKey: 'sb_publishable_xyz',
    email: 'trader@example.com',
  });

  it('returns the four inputs in the order the advisor lists them', () => {
    expect(settings.map((s) => s.label)).toEqual([
      'SupabaseUrl',
      'SupabaseKey',
      'SupabaseEmail',
      'SupabasePassword',
    ]);
  });

  it('matches the input names the advisor actually declares', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'mt5', EA_FILE_NAME),
      'utf8',
    );

    for (const setting of settings) {
      expect(source).toMatch(new RegExp(`^\\s*input\\s+string\\s+${setting.label}\\b`, 'm'));
    }
  });

  it('fills in everything the app knows and nothing it does not', () => {
    expect(settings[0].value).toBe('https://abc.supabase.co');
    expect(settings[1].value).toBe('sb_publishable_xyz');
    expect(settings[2].value).toBe('trader@example.com');
    expect(settings[3].value).toBe('');
  });

  it('marks only the password secret', () => {
    expect(settings.filter((s) => s.secret).map((s) => s.label)).toEqual(['SupabasePassword']);
  });

  it('renders a missing email as empty rather than as "undefined"', () => {
    const [, , email] = eaSettings({ supabaseUrl: 'u', supabaseKey: 'k', email: undefined });
    expect(email.value).toBe('');
  });

  it('gives every row a hint', () => {
    for (const setting of settings) {
      expect(setting.hint.length).toBeGreaterThan(0);
    }
  });
});

describe('syncStatus', () => {
  it('reports nothing connected for an empty history', () => {
    expect(syncStatus([])).toEqual({
      synced: 0,
      manual: 0,
      accounts: [],
      lastTradeAt: null,
      connected: false,
    });
  });

  it('does not count manual trades as a connection', () => {
    const status = syncStatus([makeTrade(), makeTrade()]);
    expect(status.connected).toBe(false);
    expect(status.synced).toBe(0);
    expect(status.manual).toBe(2);
  });

  it('separates imported from manual in a mixed history', () => {
    const status = syncStatus([makeTrade(), makeImported(), makeImported()]);
    expect(status.synced).toBe(2);
    expect(status.manual).toBe(1);
    expect(status.connected).toBe(true);
  });

  it('prefers the broker close time over the row creation time', () => {
    // The backfill case: created a moment ago, closed three months back.
    const status = syncStatus([
      makeImported({
        closed_at: '2026-05-01T10:00:00.000Z',
        created_at: '2026-08-15T11:59:00.000Z',
      }),
    ]);
    expect(status.lastTradeAt).toBe('2026-05-01T10:00:00.000Z');
  });

  it('falls back to the creation time when the broker sent no close time', () => {
    const status = syncStatus([
      makeImported({ closed_at: null, created_at: '2026-08-01T10:00:00.000Z' }),
    ]);
    expect(status.lastTradeAt).toBe('2026-08-01T10:00:00.000Z');
  });

  it('lists distinct accounts newest first', () => {
    const status = syncStatus([
      makeImported({ account_login: '111', closed_at: '2026-08-01T00:00:00.000Z' }),
      makeImported({ account_login: '222', closed_at: '2026-08-14T00:00:00.000Z' }),
      makeImported({ account_login: '111', closed_at: '2026-08-13T00:00:00.000Z' }),
    ]);
    expect(status.accounts).toEqual(['222', '111']);
  });

  it('ignores blank and missing account numbers', () => {
    const status = syncStatus([
      makeImported({ account_login: null }),
      makeImported({ account_login: '   ' }),
      makeImported({ account_login: ' 5031234 ' }),
    ]);
    expect(status.accounts).toEqual(['5031234']);
  });

  it('does not reorder the caller’s array', () => {
    const trades = [
      makeImported({ closed_at: '2026-08-01T00:00:00.000Z' }),
      makeImported({ closed_at: '2026-08-14T00:00:00.000Z' }),
    ];
    const before = [...trades];
    syncStatus(trades);
    expect(trades).toEqual(before);
  });
});

describe('relativeTime', () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  it('treats anything under 90 seconds as just now', () => {
    expect(relativeTime(ago(0), NOW)).toBe('just now');
    expect(relativeTime(ago(89_000), NOW)).toBe('just now');
  });

  it('tolerates a broker clock running ahead of the phone', () => {
    // MetaTrader stamps closes from the broker's server clock, so a future
    // timestamp is normal rather than a bug to be surfaced to the user.
    expect(relativeTime(new Date(NOW.getTime() + 30_000).toISOString(), NOW)).toBe('just now');
  });

  it('counts minutes up to the hour', () => {
    expect(relativeTime(ago(14 * minute), NOW)).toBe('14 minutes ago');
    expect(relativeTime(ago(59 * minute), NOW)).toBe('59 minutes ago');
  });

  it('says an hour, singular, at one hour', () => {
    expect(relativeTime(ago(hour), NOW)).toBe('an hour ago');
    expect(relativeTime(ago(5 * hour), NOW)).toBe('5 hours ago');
  });

  it('says yesterday, not "1 days ago"', () => {
    expect(relativeTime(ago(day), NOW)).toBe('yesterday');
    expect(relativeTime(ago(4 * day), NOW)).toBe('4 days ago');
  });

  it('switches to months past a month', () => {
    expect(relativeTime(ago(30 * day), NOW)).toBe('a month ago');
    expect(relativeTime(ago(75 * day), NOW)).toBe('3 months ago');
  });

  it('admits when a timestamp is unreadable instead of printing NaN', () => {
    expect(relativeTime('not a date', NOW)).toBe('at an unknown time');
    expect(relativeTime('', NOW)).toBe('at an unknown time');
  });
});
