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

module.exports = { isFreeSessionEmail };
