'use strict';
/**
 * Catalog search that grows and re-ranks the catalog on demand from
 * MusicBrainz (recordings) and ListenBrainz (listen counts, used as rank).
 *
 *   - The catalog has nothing: fetch now, then search again, so the attendee
 *     sees results on this keystroke.
 *   - The catalog has results and the query is specific: return them straight
 *     away and fetch in the background. Without this, early partial matches
 *     ("Wagonmaster" for "wagon") would stop the real song ever being fetched.
 *   - A query fetched in the last RECENT_TTL_MS isn't fetched again.
 *
 * Note: background fetches outlive the request, which suits a long-running
 * Node server. On a serverless host they may be cut short (harmless — the
 * next search retries).
 */
const { normalizeText } = require('../../dj/musicText');
const catalog = require('./trackCatalog');
const { fromRecording } = require('./musicbrainz');
const { rankByListens } = require('./listenbrainzClient');

// Fetch-on-miss for queries at least this long…
const FALLBACK_MIN_LENGTH = 3;
// …and background refresh only for specific ones (2+ words or this long).
const REFRESH_MIN_LENGTH = 6;
const RECENT_TTL_MS = 10 * 60 * 1000;

function isSpecific(key) {
  return key.includes(' ') || key.length >= REFRESH_MIN_LENGTH;
}

/**
 * @param musicbrainz  client from createMusicBrainzClient, or null for local-only
 * @param listenbrainz client from createListenBrainzClient, or null to skip ranking
 * @param store        { searchTracks, upsertTracks } — the catalog (injectable for tests)
 */
function createCatalogSearch({ musicbrainz, listenbrainz = null, now = Date.now, store = catalog } = {}) {
  const { searchTracks, upsertTracks } = store;
  const recent = new Map(); // normalised query → expiry
  const inFlight = new Map(); // normalised query → Promise<boolean>

  function recentlyFetched(key) {
    const expiry = recent.get(key);
    if (expiry && expiry > now()) return true;
    recent.delete(key);
    return false;
  }

  /** Fetch, rank and store matches for `key`. Resolves true if anything was stored. */
  async function fetchIntoCatalog(client, key) {
    const recordings = await musicbrainz.searchRecordings(key.split(' '));
    if (recordings === null) return false; // throttled or failed — try again next time
    recent.set(key, now() + RECENT_TTL_MS);
    const records = recordings.map(fromRecording).filter(Boolean);
    if (!records.length) return false;
    await upsertTracks(client, await rankByListens(listenbrainz, records));
    return true;
  }

  /** One fetch per query at a time; concurrent identical searches share it. */
  function fetchOnce(client, key) {
    if (!inFlight.has(key)) {
      const p = fetchIntoCatalog(client, key)
        .catch(() => false)
        .finally(() => inFlight.delete(key));
      inFlight.set(key, p);
    }
    return inFlight.get(key);
  }

  return async function search(client, query, { limit = 10 } = {}) {
    const results = await searchTracks(client, query, { limit });
    if (!musicbrainz) return results;

    const key = normalizeText(query);
    if (key.length < FALLBACK_MIN_LENGTH || recentlyFetched(key)) return results;

    if (!results.length) {
      const added = await fetchOnce(client, key);
      return added ? searchTracks(client, query, { limit }) : results;
    }
    if (isSpecific(key)) fetchOnce(client, key); // background: not awaited
    return results;
  };
}

module.exports = { createCatalogSearch, FALLBACK_MIN_LENGTH, REFRESH_MIN_LENGTH, RECENT_TTL_MS };
