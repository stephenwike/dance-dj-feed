'use strict';
// DJ wallet: the balance is the sum of the dj_wallet_transactions ledger.
//
// Every debit is check-then-write (read balance, compare, insert a negative
// entry). Two concurrent debits could both pass the check and overdraw the
// wallet, so debits run inside withWalletLock(), a per-DJ lease lock.
const crypto = require('crypto');

const LOCK_TTL_MS = 30_000; // a crashed holder can block the wallet for at most this long

class WalletBusyError extends Error {
  constructor() {
    super('Another wallet operation is in progress. Please try again.');
    this.statusCode = 409;
  }
}

async function getWalletBalance(db, ownerId) {
  const [row] = await db.collection('dj_wallet_transactions').aggregate([
    { $match: { ownerId } },
    { $group: { _id: null, total: { $sum: '$amountCents' } } },
  ]).toArray();
  return row?.total ?? 0;
}

/**
 * Run `fn` while holding the wallet lock for `ownerId`. Throws WalletBusyError
 * if another operation holds an unexpired lock.
 *
 * The lock is one document per DJ in dj_wallet_locks. Acquire = upsert that
 * only matches when the lock is free or expired; if it is held, the filter
 * misses, the upsert tries to insert a second doc with the same _id, and
 * Mongo rejects it with a duplicate-key error.
 */
async function withWalletLock(db, ownerId, fn, { now = Date.now } = {}) {
  const locks = db.collection('dj_wallet_locks');
  const token = crypto.randomUUID();
  const t = now();
  try {
    await locks.updateOne(
      { _id: ownerId, $or: [{ expiresAt: { $lt: new Date(t) } }, { expiresAt: { $exists: false } }] },
      { $set: { token, expiresAt: new Date(t + LOCK_TTL_MS) } },
      { upsert: true },
    );
  } catch (err) {
    if (err.code === 11000) throw new WalletBusyError();
    throw err;
  }
  try {
    return await fn();
  } finally {
    // Token check: never release a lock that expired and was taken by someone else.
    await locks.deleteOne({ _id: ownerId, token });
  }
}

module.exports = { getWalletBalance, withWalletLock, WalletBusyError, LOCK_TTL_MS };
