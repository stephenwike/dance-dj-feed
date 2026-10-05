'use strict';
const { safeReturnUrl } = require('../lib/server/safeReturnUrl');

const BASE = 'https://dancefeed.example';
const req = host => ({ headers: { host } });

describe('safeReturnUrl', () => {
  beforeAll(() => { process.env.NEXT_PUBLIC_BASE_URL = BASE; });

  test('returns to the exact address the DJ is on, so their sign-in cookie still applies', () => {
    expect(safeReturnUrl('http://localhost:4000/dj-controller', req('localhost:4000'))).toBe('http://localhost:4000/dj-controller');
    expect(safeReturnUrl('https://www.dancefeed.example/start?x=1', req('www.dancefeed.example'))).toBe('https://www.dancefeed.example/start?x=1');
  });

  test('honours the forwarded host behind a proxy', () => {
    const proxied = { headers: { host: 'internal:3000', 'x-forwarded-host': 'www.dancefeed.example' } };
    expect(safeReturnUrl('https://www.dancefeed.example/dj-controller', proxied)).toBe('https://www.dancefeed.example/dj-controller');
  });

  test('never sends the browser to another site — only the path is kept', () => {
    expect(safeReturnUrl('https://evil.example/steal?x=1', req('localhost:4000'))).toBe(`${BASE}/steal?x=1`);
    expect(safeReturnUrl('javascript://localhost:4000/x', req('localhost:4000'))).toBe(`${BASE}/x`);
  });

  test('falls back to the configured site without a request or a valid URL', () => {
    expect(safeReturnUrl('http://localhost:4000/dj-controller')).toBe(`${BASE}/dj-controller`);
    expect(safeReturnUrl('not a url', req('localhost:4000'))).toBe(BASE);
    expect(safeReturnUrl('/dj-controller', req('localhost:4000'))).toBe(`${BASE}/dj-controller`);
    expect(safeReturnUrl('//evil.example/x', req('localhost:4000'))).toBe(BASE);
  });
});
