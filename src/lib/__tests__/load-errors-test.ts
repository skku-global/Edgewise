/**
 * The regression these exist for: a dead backend arrives with an empty `code`,
 * so a mapping that switches on `code` alone reports a generic "try again later"
 * for an outage that will never clear by itself.
 */

import { describeUnreachableBackend } from '@/lib/auth-errors';
import { describeLoadError } from '@/lib/load-errors';

jest.mock('@/lib/supabase', () => ({
  BACKEND_HOST: 'nqwtetjrzoaggaerriew.supabase.co',
}));

const host = 'nqwtetjrzoaggaerriew.supabase.co';
const generic = 'Unable to load your trades right now.';

describe('describeLoadError — unreachable backend', () => {
  // Exactly what postgrest-js hands back: name-prefixed message, empty code.
  it('recognises a network failure even though code is empty', () => {
    const message = describeLoadError({
      message: 'TypeError: Failed to fetch',
      details: '',
      hint: '',
      code: '',
    });

    expect(message).toBe(describeUnreachableBackend(host));
    expect(message).not.toBe(generic);
  });

  it.each([
    ['Chrome', 'TypeError: Failed to fetch'],
    ['Safari', 'TypeError: Load failed'],
    ['Firefox', 'TypeError: NetworkError when attempting to fetch resource.'],
    ['React Native', 'TypeError: Network request failed'],
  ])('recognises the %s wording', (_platform, message) => {
    expect(describeLoadError({ message, code: '' })).toBe(describeUnreachableBackend(host));
  });

  it('names the host it could not reach', () => {
    expect(describeLoadError({ message: 'TypeError: Failed to fetch', code: '' })).toContain(host);
  });

  // "right now" is a promise of transience. A paused project loses its DNS
  // record and will not come back on its own, so it must not be made here.
  it('does not tell the reader to just wait', () => {
    expect(describeLoadError({ message: 'TypeError: Failed to fetch', code: '' })).not.toContain(
      'right now',
    );
  });

  // Order, not coincidence: nothing arrived, so no schema claim has been tested.
  it('reports the outage ahead of a schema code, when both are present', () => {
    const message = describeLoadError({ message: 'TypeError: Failed to fetch', code: '42703' });

    expect(message).toBe(describeUnreachableBackend(host));
    expect(message).not.toContain('add-broker-sync.sql');
  });
});

describe('describeLoadError — everything it must not swallow', () => {
  it.each([
    ['42703 undefined_column', '42703'],
    ['42P01 undefined_table', '42P01'],
  ])('still points at the migration for %s', (_label, code) => {
    const message = describeLoadError({ code, message: 'column does not exist' });

    expect(message).toContain('add-broker-sync.sql');
    expect(message).toContain('Supabase SQL editor');
  });

  it.each([
    ['a permission denial', { code: '42501', message: 'permission denied for table trades' }],
    ['an RLS refusal', { code: '42501', message: 'new row violates row-level security policy' }],
    ['an unknown code', { code: 'PGRST301', message: 'JWT expired' }],
    ['no code at all', { message: 'something else went wrong' }],
  ])('falls back to the generic line for %s', (_label, err) => {
    expect(describeLoadError(err)).toBe(generic);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a bare string', 'boom'],
    ['a number', 500],
  ])('survives %s without throwing', (_label, err) => {
    expect(describeLoadError(err)).toBe(generic);
  });
});
