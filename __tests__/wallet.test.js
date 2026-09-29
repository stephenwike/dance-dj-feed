'use strict';
const { withWalletLock, getWalletBalance, WalletBusyError, LOCK_TTL_MS } = require('../lib/server/wallet');
const { claimStripeEvent, releaseStripeEvent } = require('../lib/server/stripeEvents');

function duplicateKeyError() {
  return Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
}

// In-memory stand-in for the parts of a Mongo collection these modules use.
function fakeDb({ transactions = [] } = {}) {
  const docs = new Map(); // _id -> doc, for the lock / event collections

  const lockMatches = (doc, filter) => {
    if (!doc) return false;
    if (filter.token !== undefined && doc.token !== filter.token) return false;
    if (!filter.$or) return true;
    return filter.$or.some(cond =>
      cond.expiresAt?.$exists === false ? doc.expiresAt === undefined
        : cond.expiresAt?.$lt ? doc.expiresAt < cond.expiresAt.$lt
          : false);
  };

  const keyed = {
    updateOne: jest.fn(async (filter, update, opts = {}) => {
      const doc = docs.get(filter._id);
      if (lockMatches(doc, filter)) { Object.assign(doc, update.$set); return; }
      if (!opts.upsert) return;
      if (docs.has(filter._id)) throw duplicateKeyError();
      docs.set(filter._id, { _id: filter._id, ...update.$set });
    }),
    insertOne: jest.fn(async (doc) => {
      if (docs.has(doc._id)) throw duplicateKeyError();
      docs.set(doc._id, doc);
    }),
    deleteOne: jest.fn(async (filter) => {
      if (lockMatches(docs.get(filter._id), filter)) docs.delete(filter._id);
    }),
  };

  const ledger = {
    aggregate: jest.fn(([{ $match }]) => ({
      toArray: async () => {
        const rows = transactions.filter(t => t.ownerId === $match.ownerId);
        return rows.length ? [{ _id: null, total: rows.reduce((s, t) => s + t.amountCents, 0) }] : [];
      },
    })),
  };

  return {
    docs,
    collection: (name) => (name === 'dj_wallet_transactions' ? ledger : keyed),
  };
}

describe('getWalletBalance', () => {
  test('sums the ledger for one owner', async () => {
    const db = fakeDb({ transactions: [
      { ownerId: 'dj1', amountCents: 500 },
      { ownerId: 'dj1', amountCents: -200 },
      { ownerId: 'dj2', amountCents: 999 },
    ] });
    expect(await getWalletBalance(db, 'dj1')).toBe(300);
  });

  test('is 0 for an owner with no transactions', async () => {
    expect(await getWalletBalance(fakeDb(), 'nobody')).toBe(0);
  });
});

describe('withWalletLock', () => {
  test('runs the callback and returns its result', async () => {
    const db = fakeDb();
    await expect(withWalletLock(db, 'dj1', async () => 42)).resolves.toBe(42);
  });

  test('a second operation for the same DJ is rejected while the first holds the lock', async () => {
    const db = fakeDb();
    let release;
    const first = withWalletLock(db, 'dj1', () => new Promise(r => { release = r; }));
    await new Promise(r => setImmediate(r)); // let the first acquire

    await expect(withWalletLock(db, 'dj1', async () => 'second')).rejects.toBeInstanceOf(WalletBusyError);

    release('first');
    await expect(first).resolves.toBe('first');
  });

  test('different DJs do not block each other', async () => {
    const db = fakeDb();
    let release;
    const first = withWalletLock(db, 'dj1', () => new Promise(r => { release = r; }));
    await new Promise(r => setImmediate(r));

    await expect(withWalletLock(db, 'dj2', async () => 'ok')).resolves.toBe('ok');
    release();
    await first;
  });

  test('releases the lock when the callback throws', async () => {
    const db = fakeDb();
    await expect(withWalletLock(db, 'dj1', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(withWalletLock(db, 'dj1', async () => 'again')).resolves.toBe('again');
  });

  test('an expired lock (crashed holder) can be taken over', async () => {
    const db = fakeDb();
    db.docs.set('dj1', { _id: 'dj1', token: 'stale', expiresAt: new Date(Date.now() - 1) });
    await expect(withWalletLock(db, 'dj1', async () => 'recovered')).resolves.toBe('recovered');
  });

  test('does not release a lock that was taken over after it expired', async () => {
    const db = fakeDb();
    let t = 0;
    const now = () => t;
    await withWalletLock(db, 'dj1', async () => {
      // Our lease expires mid-operation and another request takes the lock.
      t = LOCK_TTL_MS + 1;
      await withWalletLock(db, 'dj1', async () => {}, { now }).catch(() => {});
      db.docs.set('dj1', { _id: 'dj1', token: 'someone-else', expiresAt: new Date(t + LOCK_TTL_MS) });
    }, { now });
    expect(db.docs.get('dj1')?.token).toBe('someone-else');
  });
});

describe('Stripe event claims', () => {
  const event = { id: 'evt_1', type: 'checkout.session.completed' };

  test('the first delivery claims the event, a retry does not', async () => {
    const db = fakeDb();
    expect(await claimStripeEvent(db, event)).toBe(true);
    expect(await claimStripeEvent(db, event)).toBe(false);
  });

  test('a released claim can be processed again', async () => {
    const db = fakeDb();
    await claimStripeEvent(db, event);
    await releaseStripeEvent(db, event);
    expect(await claimStripeEvent(db, event)).toBe(true);
  });
});
