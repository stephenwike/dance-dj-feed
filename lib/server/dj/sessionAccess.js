'use strict';

const DB_NAME = process.env.MONGODB_DB || 'djfeed';

async function isFreeSessionEmail(client, email) {
  if (!email) return false;
  const now = new Date();
  const doc = await client.db(DB_NAME).collection('free_access').findOne({
    email: email.toLowerCase(),
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  });
  return doc !== null;
}

/**
 * Whether this DJ is charged for sessions and add-ons: payments are enabled
 * and their email isn't on the free-access list.
 */
async function djPays(client, email) {
  if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true') return false;
  return !(await isFreeSessionEmail(client, email));
}

module.exports = { isFreeSessionEmail, djPays };
