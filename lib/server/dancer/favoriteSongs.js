'use strict';
/**
 * A dancer's favorite songs — for partner dances, which aren't catalog line
 * dances and so can't use the Line Dance Manager's marks (see
 * lib/server/ldco/danceMarks.js).
 *
 * A song is identified by its music catalog id (music_catalog.tracks._id,
 * e.g. "musicbrainz:<recording MBID>") — the same value a request stores as
 * catalogTrackId when the song was picked from the suggestions. Typed-in
 * songs have no id and can't be favorited.
 *
 * Kept in this app's database (the manager is a line-dance tool), one
 * document per favorite, keyed by the shared account id:
 *   dancer_favorite_songs { _id, userId, trackId, createdAt }
 * Title and artist come from the catalog when shown.
 */
const { ObjectId } = require('mongodb');
const { DB_NAME } = require('../db');
const { getTrack, tracksCollection } = require('../catalog/trackCatalog');

const COLLECTION = 'dancer_favorite_songs';

function favoritesCollection(client) {
  return client.db(DB_NAME).collection(COLLECTION);
}

/** [trackId] the user has favorited. */
async function getFavoriteSongs(client, userId) {
  return (await favoritesCollection(client).distinct('trackId', { userId })).map(String);
}

/**
 * The user's favorite songs with what's needed to show and request them:
 * [{ id, title, artist, durationMs }], most recently favorited first. A
 * song since removed from the catalog is left out.
 */
async function getFavoriteSongDetails(client, userId) {
  const favorites = await favoritesCollection(client)
    .find({ userId }, { projection: { trackId: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .toArray();
  if (!favorites.length) return [];
  const tracks = await tracksCollection(client)
    .find({ _id: { $in: favorites.map(f => f.trackId) } }, { projection: { title: 1, artist: 1, durationMs: 1 } })
    .toArray();
  const byId = new Map(tracks.map(t => [String(t._id), t]));
  return favorites
    .map(f => byId.get(String(f.trackId)))
    .filter(Boolean)
    .map(t => ({ id: String(t._id), title: t.title, artist: t.artist, durationMs: t.durationMs ?? null }));
}

/** Favorite or unfavorite a catalog song. Idempotent, like the dance marks. */
async function setFavoriteSong(client, userId, { trackId, on }) {
  const id = typeof trackId === 'string' ? trackId.trim() : '';
  if (!id) throw Object.assign(new Error('trackId is required'), { statusCode: 400 });
  const col = favoritesCollection(client);

  if (!on) {
    await col.deleteMany({ userId, trackId: id });
    return { trackId: id, on: false };
  }

  if (!(await getTrack(client, id))) throw Object.assign(new Error('Song not found'), { statusCode: 404 });
  await col.updateOne(
    { userId, trackId: id },
    { $setOnInsert: { _id: new ObjectId().toString(), userId, trackId: id, createdAt: new Date() } },
    { upsert: true },
  );
  return { trackId: id, on: true };
}

module.exports = { COLLECTION, getFavoriteSongs, getFavoriteSongDetails, setFavoriteSong };
