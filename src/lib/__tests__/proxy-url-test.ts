/**
 * Five features share one proxy address. These pin the resolution order so a
 * future "quick fix" in one library cannot quietly reintroduce the split where
 * Coach worked and plan grading did not on the same deploy.
 */

import { getEffectiveProxyUrl, proxyErrorMessage } from '@/lib/proxy-url';

describe('getEffectiveProxyUrl', () => {
  it('prefers the configured URL over the page origin', () => {
    expect(getEffectiveProxyUrl('http://localhost:8788', 'https://app.example')).toBe(
      'http://localhost:8788',
    );
  });

  it('strips trailing slashes so callers can append /v1/... safely', () => {
    expect(getEffectiveProxyUrl('http://localhost:8788///', '')).toBe('http://localhost:8788');
    expect(getEffectiveProxyUrl('', 'https://app.example/')).toBe('https://app.example');
  });

  it('treats whitespace-only config as unset and falls back to the origin', () => {
    expect(getEffectiveProxyUrl('   ', 'https://app.example')).toBe('https://app.example');
  });

  it('returns nothing when there is neither config nor an origin (native)', () => {
    expect(getEffectiveProxyUrl(undefined, '')).toBe('');
  });
});

describe('proxyErrorMessage', () => {
  it('uses the upstream message when the body carries one', () => {
    const body = JSON.stringify({ error: { message: 'model not found' } });
    expect(proxyErrorMessage(404, body, 'https://x')).toBe('model not found');
  });

  it('explains a bare 404 as a missing proxy rather than an AI fault', () => {
    expect(proxyErrorMessage(404, '<html>Not found</html>', 'https://pages.example')).toMatch(
      /No AI proxy answered at https:\/\/pages\.example/,
    );
  });

  it('falls back to the status for anything else', () => {
    expect(proxyErrorMessage(418, '', 'https://x')).toBe('AI error 418');
  });
});
