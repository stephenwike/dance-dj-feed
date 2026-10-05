'use strict';
/**
 * A dancer's marks on catalog line dances, shared with the Line Dance Manager.
 *
 * Both apps sign in through the same LDCO auth server, so a user's id here
 * (session.user.id, the OAuth `sub`) is the same `userId` the manager uses.
 * The manager stores each mark as its own document in the `ldco` database:
 *   user_favorite_dances  { _id, userId, danceId, createdAt }  — ♥ Favorites
 *   user_flagged_dances   { _id, userId, danceId, createdAt }  — ⚑ Wishlist
 *   user_known_dances     { _id, userId, danceId, createdAt }  — knows it
 *   user_refresh_dances   { _id, userId, danceId, createdAt }  — knows it,
 *                                                                wants a refresher
 * and we read and write the same documents, in the same shape, so a mark made
 * at an event shows up in the manager and vice versa. (In the manager,
 * "refresh" always comes with "known".)
 *
 * Rules kept here:
 *   - Learned: off the wishlist, known (if not already), no longer refresh.
 *   - Wishlisting a dance you already know means you want to refresh it, so
 *     it's marked refresh too.
 */
const { ObjectId } = require('mongodb');

const LDCO_DB = 'ldco';
const MARK_COLLECTIONS = {
  favorite: 'user_favorite_dances',
  wishlist: 'user_flagged_dances',
  known: 'user_known_dances',
  refresh: 'user_refresh_dances',
};
const MARK_KINDS = Object.keys(MARK_COLLECTIONS);
// What a dancer turns on and off directly; known/refresh follow from the rules above.
const TOGGLE_KINDS = ['favorite', 'wishlist'];

function marksCollection(client, kind) {
  const name = MARK_COLLECTIONS[kind];
  if (!name) throw Object.assign(new Error(`Unknown mark: ${kind}`), { statusCode: 400 });
  return client.db(LDCO_DB).collection(name);
}

function cleanDanceId(danceId) {
  const id = typeof danceId === 'string' ? danceId.trim() : '';
  if (!id) throw Object.assign(new Error('danceId is required'), { statusCode: 400 });
  return id;
}

async function assertCatalogDance(client, id) {
  const exists = await client.db(LDCO_DB).collection('dances').findOne({ _id: id }, { projection: { _id: 1 } });
  if (!exists) throw Object.assign(new Error('Dance not found'), { statusCode: 404 });
}

// Upsert so a double tap (or a race) never makes two documents. Same
// document shape the manager writes: string _id, Date createdAt.
async function addMark(client, userId, kind, danceId) {
  await marksCollection(client, kind).updateOne(
    { userId, danceId },
    { $setOnInsert: { _id: new ObjectId().toString(), userId, danceId, createdAt: new Date() } },
    { upsert: true },
  );
}

async function removeMark(client, userId, kind, danceId) {
  await marksCollection(client, kind).deleteMany({ userId, danceId });
}

/** { favorite, wishlist, known, refresh: [danceId] } for a user. */
async function getDanceMarks(client, userId) {
  const entries = await Promise.all(MARK_KINDS.map(async kind => {
    const ids = await marksCollection(client, kind).distinct('danceId', { userId });
    return [kind, ids.map(String)];
  }));
  return Object.fromEntries(entries);
}

/**
 * Turn a favorite or wishlist mark on or off. Idempotent: marking twice keeps
 * one document, unmarking something unmarked is a no-op. Only catalog dances
 * can be marked (the manager lists marks by dance).
 */
async function setDanceMark(client, userId, { danceId, kind, on }) {
  if (!TOGGLE_KINDS.includes(kind)) throw Object.assign(new Error(`Unknown mark: ${kind}`), { statusCode: 400 });
  const id = cleanDanceId(danceId);

  if (!on) {
    await removeMark(client, userId, kind, id);
    return { danceId: id, kind, on: false };
  }

  await assertCatalogDance(client, id);
  await addMark(client, userId, kind, id);
  let refresh = false;
  if (kind === 'wishlist' && await marksCollection(client, 'known').findOne({ userId, danceId: id })) {
    await addMark(client, userId, 'refresh', id);
    refresh = true;
  }
  return { danceId: id, kind, on: true, ...(refresh && { refresh }) };
}

/** "I've learned it": off the wishlist, known, and no longer to refresh. */
async function markLearned(client, userId, { danceId }) {
  const id = cleanDanceId(danceId);
  await assertCatalogDance(client, id);
  await Promise.all([
    removeMark(client, userId, 'wishlist', id),
    addMark(client, userId, 'known', id),
    removeMark(client, userId, 'refresh', id),
  ]);
  return { danceId: id, learned: true };
}

module.exports = { MARK_KINDS, TOGGLE_KINDS, MARK_COLLECTIONS, getDanceMarks, setDanceMark, markLearned };
