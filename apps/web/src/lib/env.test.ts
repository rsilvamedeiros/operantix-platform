import { describe, expect, it } from 'vitest';
import { apiBaseUrl } from './env';

describe('apiBaseUrl', () => {
  it('defaults to the local Platform API', () => {
    expect(apiBaseUrl({})).toBe('http://localhost:3000');
  });

  it('reads API_BASE_URL and drops a trailing slash', () => {
    expect(apiBaseUrl({ API_BASE_URL: 'https://api.operantix.test/' })).toBe(
      'https://api.operantix.test',
    );
  });

  it('treats a blank value as unset, like .env.example ships it', () => {
    expect(apiBaseUrl({ API_BASE_URL: '' })).toBe('http://localhost:3000');
  });

  it.each(['not a url', 'ftp://api.test', 'javascript:alert(1)'])('rejects %s', (value) => {
    expect(() => apiBaseUrl({ API_BASE_URL: value })).toThrow(/API_BASE_URL/);
  });

  it('never repeats the rejected value', () => {
    expect(() => apiBaseUrl({ API_BASE_URL: 'ftp://user:secret@api.test' })).not.toThrow(
      /secret/,
    );
  });
});
