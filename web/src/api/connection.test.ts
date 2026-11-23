import { describe, expect, it } from 'vitest';
import { parseLink } from './connection';

const engine = encodeURIComponent('http://127.0.0.1:8765');

describe('parseLink', () => {
  it('reads the engine address and token from the link the engine prints', () => {
    expect(parseLink(`http://localhost:5173/#engine=${engine}&token=abc`)).toEqual({
      url: 'http://127.0.0.1:8765',
      token: 'abc',
    });
    expect(parseLink(`engine=${engine}&token=abc`)?.token).toBe('abc');
  });

  it('accepts localhost', () => {
    expect(parseLink(`#engine=${encodeURIComponent('http://localhost:9000')}&token=t`)?.url).toBe('http://localhost:9000');
  });

  it('refuses to send the token anywhere but this computer', () => {
    expect(parseLink(`#engine=${encodeURIComponent('http://example.com:8765')}&token=t`)).toBeNull();
    expect(parseLink(`#engine=${encodeURIComponent('https://127.0.0.1:8765')}&token=t`)).toBeNull();
    expect(parseLink(`#engine=${encodeURIComponent('http://127.0.0.1.evil.com')}&token=t`)).toBeNull();
  });

  it('needs both parts', () => {
    expect(parseLink(`#engine=${engine}`)).toBeNull();
    expect(parseLink('#token=t')).toBeNull();
    expect(parseLink('#engine=not a url&token=t')).toBeNull();
  });
});
