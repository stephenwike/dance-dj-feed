'use strict';
/**
 * Filters the dance catalogue for what an attendee is allowed to request.
 *
 * Rules:
 *   1. A dance currently PLAYING  → hidden (can't request what's already on)
 *   2. A dance already PLAYED     → hidden, UNLESS it has been explicitly
 *      re-requested (a pending/approved request whose createdAt is AFTER the
 *      last play event for that dance).  This allows intentional repeats while
 *      preventing accidental re-requests of recently-played dances.
 *
 * Matching is by danceId.  Custom requests (no danceId) are ignored because
 * they don't correspond to catalogue entries.
 */
function filterAvailableDances(dances, requests) {
  const playingIds = new Set();
  const playedIds = new Set();
  const lastPlayedAt = {}; // danceId → ms timestamp of most-recent play

  for (const r of requests) {
    if (!r.danceId) continue;
    const id = String(r.danceId);

    if (r.status === 'playing') {
      playingIds.add(id);
    } else if (r.status === 'played') {
      playedIds.add(id);
      const t = new Date(r.updatedAt ?? r.createdAt).getTime();
      if (!lastPlayedAt[id] || t > lastPlayedAt[id]) lastPlayedAt[id] = t;
    }
  }

  // A played dance may be re-requested if a pending/approved request was
  // submitted AFTER the dance was last played.
  const reRequestedIds = new Set();
  for (const r of requests) {
    if (!r.danceId) continue;
    if (r.status !== 'pending' && r.status !== 'approved') continue;
    const id = String(r.danceId);
    if (playedIds.has(id) && lastPlayedAt[id]) {
      if (new Date(r.createdAt).getTime() > lastPlayedAt[id]) {
        reRequestedIds.add(id);
      }
    }
  }

  return dances.filter(dance => {
    // The dances API serialises _id as the string field `id`
    const id = String(dance.id ?? dance._id);
    if (playingIds.has(id)) return false;                           // rule 1
    if (playedIds.has(id) && !reRequestedIds.has(id)) return false; // rule 2
    return true;
  });
}

module.exports = { filterAvailableDances };
