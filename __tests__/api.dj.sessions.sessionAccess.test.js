'use strict';

const { isFreeSessionEmail } = require('../lib/server/dj/sessionAccess');

function makeClient(doc) {
  return {
    db: () => ({
      collection: () => ({
        findOne: jest.fn().mockResolvedValue(doc ?? null),
      }),
    }),
  };
}

describe('isFreeSessionEmail', () => {
  test('returns false for null email', async () => {
    expect(await isFreeSessionEmail(makeClient({}), null)).toBe(false);
  });

  test('returns false for undefined email', async () => {
    expect(await isFreeSessionEmail(makeClient({}), undefined)).toBe(false);
  });

  test('returns true when a matching doc exists (no expiry)', async () => {
    const client = makeClient({ email: 'alice@example.com', expiresAt: null });
    expect(await isFreeSessionEmail(client, 'alice@example.com')).toBe(true);
  });

  test('returns false when no matching doc', async () => {
    expect(await isFreeSessionEmail(makeClient(null), 'alice@example.com')).toBe(false);
  });

  test('lowercases email before querying', async () => {
    const findOne = jest.fn().mockResolvedValue({ email: 'alice@example.com' });
    const client = { db: () => ({ collection: () => ({ findOne }) }) };
    await isFreeSessionEmail(client, 'Alice@Example.COM');
    expect(findOne.mock.calls[0][0].email).toBe('alice@example.com');
  });

  test('passes expiry filter in query', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const client = { db: () => ({ collection: () => ({ findOne }) }) };
    await isFreeSessionEmail(client, 'alice@example.com');
    const query = findOne.mock.calls[0][0];
    expect(query.$or).toBeDefined();
    expect(query.$or.some(c => c.expiresAt === null)).toBe(true);
    expect(query.$or.some(c => c.expiresAt?.$gt instanceof Date)).toBe(true);
  });
});
