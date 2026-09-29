'use strict';
/**
 * The music catalog: a song database attendees search when requesting, kept
 * in its own Mongo database (MUSIC_CATALOG_DB, default "music_catalog") so
 * it never touches the shared ldco catalog other apps depend on.
 *
 * tracks document:
 *   _id            "<source>:<sourceId>" (e.g. "musicbrainz:3063310a-…")
 *   source         where it came from ("musicbrainz")
 *   sourceId       the source's own id (MusicBrainz recording MBID)
 *   title, artist  display strings (artist = full artist credit)
 *   disambiguation version note from the source ("live", "radio edit"), or ''
 *   durationMs     recording length, or null
 *   isrcs          [ISRC] — the strongest key for matching a DJ's local file
 *   year           first release year, or null
 *   rank           popularity proxy used to order results (higher first)
 *   nTitle, nArtist normalised title/artist (lib/dj/musicText) for matching
 *   words          unique normalised words of title + artist, for search
 *   variantKey     nTitle|nArtist — versions of one song share it, so search
 *                  can show one row per song
 *
 * Exported as CJS so Jest and the import scripts can require it directly.
 */
const { normalizeText } = require('../../dj/musicText');
const { escapeRegex } = require('../db');

const CATALOG_DB = process.env.MUSIC_CATALOG_DB || 'music_catalog';
const TRACKS = 'tracks';

// Prefix searches on one or two letters match too much of a large catalog.
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 25;

function tracksCollection(client) {
  return client.db(CATALOG_DB).collection(TRACKS);
}

async function ensureIndexes(client) {
  const col = tracksCollection(client);
  await col.createIndexes([
    { key: { words: 1, rank: -1 }, name: 'search' },
    { key: { isrcs: 1 }, name: 'isrc' },
    { key: { variantKey: 1, rank: -1 }, name: 'variant' },
  ]);
}

/**
 * Validate and derive a tracks document from a source record
 * ({ source, sourceId, title, artist, disambiguation?, durationMs?, isrcs?, year?, rank? }).
 * Throws on records missing the fields every track needs.
 */
function toTrackDoc(record) {
  const { source, sourceId, title, artist } = record ?? {};
  if (!source || !sourceId || !title || !artist) {
    throw new Error(`Track record needs source, sourceId, title and artist: ${JSON.stringify(record)}`);
  }
  const nTitle = normalizeText(title);
  const nArtist = normalizeText(artist);
  const durationMs = Number.isFinite(record.durationMs) && record.durationMs > 0 ? Math.round(record.durationMs) : null;
  return {
    _id: `${source}:${sourceId}`,
    source,
    sourceId,
    title: String(title),
    artist: String(artist),
    disambiguation: record.disambiguation ? String(record.disambiguation) : '',
    durationMs,
    isrcs: [...new Set((record.isrcs ?? []).map(i => String(i).toUpperCase()))],
    year: Number.isInteger(record.year) ? record.year : null,
    rank: Number.isFinite(record.rank) ? record.rank : 0,
    nTitle,
    nArtist,
    words: [...new Set(`${nTitle} ${nArtist}`.split(' ').filter(Boolean))],
    variantKey: `${nTitle}|${nArtist}`,
  };
}

/**
 * Insert or refresh tracks. ISRCs accumulate rather than being replaced, so
 * a later import without ISRC lookups never erases ones found earlier.
 * @returns {{ upserted: number, modified: number }}
 */
async function upsertTracks(client, records) {
  if (!records.length) return { upserted: 0, modified: 0 };
  const now = new Date();
  const ops = records.map(record => {
    const { _id, isrcs, ...fields } = toTrackDoc(record);
    const update = { $set: { ...fields, updatedAt: now } };
    if (isrcs.length) update.$addToSet = { isrcs: { $each: isrcs } };
    update.$setOnInsert = isrcs.length ? { createdAt: now } : { createdAt: now, isrcs: [] };
    return { updateOne: { filter: { _id }, update, upsert: true } };
  });
  const res = await tracksCollection(client).bulkWrite(ops, { ordered: false });
  return { upserted: res.upsertedCount, modified: res.modifiedCount };
}

/**
 * Mongo filter for a type-ahead query, or null if the query is too short.
 * Every word must match; the last one may be partial ("copperhead ro").
 */
function buildSearchFilter(query) {
  const words = normalizeText(query).split(' ').filter(Boolean);
  if (words.join(' ').length < MIN_QUERY_LENGTH) return null;
  const complete = words.slice(0, -1);
  const partial = words[words.length - 1];
  const clauses = complete.map(w => ({ words: w }));
  clauses.push({ words: { $regex: `^${escapeRegex(partial)}` } });
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

/** Keep the highest-ranked version of each song (docs must arrive rank-sorted). */
function onePerSong(docs, limit) {
  const seen = new Set();
  const out = [];
  for (const d of docs) {
    if (seen.has(d.variantKey)) continue;
    seen.add(d.variantKey);
    out.push(d);
    if (out.length >= limit) break;
  }
  return out;
}

/** What attendees see for a track — no internal matching fields. */
function toSearchResult(d) {
  return {
    id: d._id,
    title: d.title,
    artist: d.artist,
    disambiguation: d.disambiguation,
    durationMs: d.durationMs,
    year: d.year,
  };
}

async function searchTracks(client, query, { limit = 10 } = {}) {
  const filter = buildSearchFilter(query);
  if (!filter) return [];
  const capped = Math.min(Math.max(1, limit), MAX_RESULTS);
  const docs = await tracksCollection(client)
    .find(filter, { projection: { title: 1, artist: 1, disambiguation: 1, durationMs: 1, year: 1, variantKey: 1 } })
    .sort({ rank: -1 })
    // Versions of a song collapse to one row, so over-fetch before de-duping.
    .limit(capped * 5)
    .toArray();
  return onePerSong(docs, capped).map(toSearchResult);
}

async function getTrack(client, id) {
  return tracksCollection(client).findOne({ _id: String(id) });
}

module.exports = {
  CATALOG_DB,
  MIN_QUERY_LENGTH,
  tracksCollection,
  ensureIndexes,
  toTrackDoc,
  upsertTracks,
  buildSearchFilter,
  onePerSong,
  toSearchResult,
  searchTracks,
  getTrack,
};
