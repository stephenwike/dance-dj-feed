'use strict';
const { isFreeSessionEmail } = require('../lib/server/dj/sessionAccess');

describe('isFreeSessionEmail', () => {
  const ORIGINAL_ENV = process.env.DJ_FREE_SESSION_EMAILS;

  afterEach(() => {
    process.env.DJ_FREE_SESSION_EMAILS = ORIGINAL_ENV;
  });

  test('returns false when the env var is unset', () => {
    delete process.env.DJ_FREE_SESSION_EMAILS;
    expect(isFreeSessionEmail('alice@example.com')).toBe(false);
  });

  test('returns true for an email in the list', () => {
    process.env.DJ_FREE_SESSION_EMAILS = 'alice@example.com,bob@example.com';
    expect(isFreeSessionEmail('bob@example.com')).toBe(true);
  });

  test('returns false for an email not in the list', () => {
    process.env.DJ_FREE_SESSION_EMAILS = 'alice@example.com,bob@example.com';
    expect(isFreeSessionEmail('charlie@example.com')).toBe(false);
  });

  test('comparison is case-insensitive', () => {
    process.env.DJ_FREE_SESSION_EMAILS = 'Alice@Example.COM';
    expect(isFreeSessionEmail('alice@example.com')).toBe(true);
  });

  test('trims whitespace around emails', () => {
    process.env.DJ_FREE_SESSION_EMAILS = ' alice@example.com , bob@example.com ';
    expect(isFreeSessionEmail('bob@example.com')).toBe(true);
  });

  test('returns false for null/undefined email', () => {
    process.env.DJ_FREE_SESSION_EMAILS = 'alice@example.com';
    expect(isFreeSessionEmail(null)).toBe(false);
    expect(isFreeSessionEmail(undefined)).toBe(false);
  });
});
