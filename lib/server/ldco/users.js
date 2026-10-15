'use strict';
/**
 * Accounts, read from the shared `ldco.users` collection (written by
 * ldco-auth). Everyone signs in through ldco-auth, so a DJ Feed user id is a
 * `users._id`. This replaces the old `djfeed.user_profiles` copy; which app a
 * user signed in to, and when, is recorded by ldco-auth in `ldco.login_events`.
 *
 * Returns accounts as { id, name, email }.
 */
const { ObjectId } = require('mongodb');
const { exactCaseInsensitive } = require('../db');

const LDCO_DB = 'ldco';
const PROJECTION = { projection: { _id: 1, name: 1, email: 1 } };

function users(client) {
  return client.db(LDCO_DB).collection('users');
}

function toAccount(u) {
  return { id: String(u._id), name: u.name ?? '', email: u.email ?? '' };
}

// User ids are strings, but some older users may still have ObjectId _ids
// until ldco-database migration 0003 runs, so match both forms.
function idFilter(ids) {
  const strings = [...new Set(ids.filter(Boolean).map(String))];
  const objectIds = strings.filter(id => /^[0-9a-f]{24}$/i.test(id)).map(id => new ObjectId(id));
  return { _id: { $in: [...strings, ...objectIds] } };
}

async function findAccountsByIds(client, ids) {
  if (!ids.length) return [];
  return (await users(client).find(idFilter(ids), PROJECTION).toArray()).map(toAccount);
}

async function findAccountById(client, id) {
  return (await findAccountsByIds(client, [id]))[0] ?? null;
}

async function findAccountsByEmails(client, emails) {
  const unique = [...new Set(emails.filter(Boolean).map(e => e.trim()))];
  if (!unique.length) return [];
  const docs = await users(client)
    .find({ $or: unique.map(e => ({ email: exactCaseInsensitive(e) })) }, PROJECTION)
    .toArray();
  return docs.map(toAccount);
}

async function findAccountByEmail(client, email) {
  return email ? (await findAccountsByEmails(client, [email]))[0] ?? null : null;
}

module.exports = { findAccountsByIds, findAccountById, findAccountsByEmails, findAccountByEmail };
