import { describe, expect, it } from 'vitest';
import { isWithinBaseUrl } from './base-url';

describe('isWithinBaseUrl', () => {
  it.each([
    ['https://api.example.test/v2', 'https://api.example.test/v2'],
    ['https://api.example.test/v2/leads?page=2', 'https://api.example.test/v2'],
    ['https://API.example.test:443/v2/x', 'https://api.example.test/v2'],
    ['https://api.example.test/anything', 'https://api.example.test'],
    ['https://api.example.test/v2/x', 'https://api.example.test/v2/'],
  ])('lets %s use %s', (url, base) => {
    expect(isWithinBaseUrl(new URL(url), base)).toBe(true);
  });

  it.each([
    ['another host', 'https://evil.example.test/v2', 'https://api.example.test/v2'],
    ['a suffix host', 'https://api.example.test.evil.test/v2', 'https://api.example.test'],
    ['another scheme', 'http://api.example.test/v2', 'https://api.example.test/v2'],
    ['another port', 'https://api.example.test:8443/v2', 'https://api.example.test/v2'],
    ['a sibling path', 'https://api.example.test/v20', 'https://api.example.test/v2'],
    ['a parent path', 'https://api.example.test/', 'https://api.example.test/v2'],
    [
      'an encoded traversal',
      'https://api.example.test/v2/%2e%2e/admin',
      'https://api.example.test/v2',
    ],
    ['credentials in the URL', 'https://u:p@api.example.test/v2', 'https://api.example.test/v2'],
    ['an unparsable base', 'https://api.example.test/v2', 'not a url'],
  ])('refuses %s', (_, url, base) => {
    expect(isWithinBaseUrl(new URL(url), base)).toBe(false);
  });
});
