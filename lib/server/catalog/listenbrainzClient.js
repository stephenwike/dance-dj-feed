'use strict';
/**
 * ListenBrainz popularity: how many times each recording has been listened
 * to. MusicBrainz has no popularity signal of its own, so this is what ranks
 * the catalog (the well-known version of a song above covers and bootlegs).
 *
 * ListenBrainz data is CC0. MetaBrainz asks commercial users to support them
 * voluntarily (https://metabrainz.org/supporters).
 * API: https://listenbrainz.readthedocs.io/en/latest/users/api/popularity.html
 */

const POPULARITY_URL = 'https://api.listenbrainz.org/1/popularity/recording';
// Keep requests a modest size; seeding pages are 100 recordings.
const BATCH_SIZE = 100;

function createListenBrainzClient({ userAgent, fetchImpl = fetch } = {}) {
  /**
   * Map of recording MBID → total listen count (0 when ListenBrainz knows the
   * recording but has no listens), or null if the lookup failed. Never throws.
   */
  async function listenCounts(mbids) {
    const ids = [...new Set(mbids)].filter(Boolean);
    const counts = new Map();
    try {
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const res = await fetchImpl(POPULARITY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(userAgent ? { 'User-Agent': userAgent } : {}) },
          body: JSON.stringify({ recording_mbids: ids.slice(i, i + BATCH_SIZE) }),
        });
        if (!res.ok) return null;
        for (const row of await res.json()) {
          counts.set(row.recording_mbid, row.total_listen_count ?? 0);
        }
      }
      return counts;
    } catch {
      return null;
    }
  }

  return { listenCounts };
}

/**
 * Give catalog records their listen counts as `rank`. When the lookup
 * failed, records keep rank undefined, so upserting them leaves any rank
 * already in the catalog untouched.
 */
async function rankByListens(listenbrainz, records) {
  if (!listenbrainz || !records.length) return records;
  const counts = await listenbrainz.listenCounts(records.map(r => r.sourceId));
  if (!counts) return records;
  return records.map(r => ({ ...r, rank: counts.get(r.sourceId) ?? 0 }));
}

module.exports = { createListenBrainzClient, rankByListens };
