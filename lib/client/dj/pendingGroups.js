'use strict';
const { computeScore } = require('./fairnessScore');

/**
 * Build the "By Dance" pending groups shown in the right panel.
 *
 * Rules:
 * - Dances already approved/playing in the queue are excluded entirely —
 *   they do not need DJ action (the count badge on the queue card shows them).
 * - The remaining pending requests are grouped by dance and sorted by
 *   descending request count.
 */
// Compound key: same dance + same swap song = one group.
// Original and swap variants of the same dance stay separate.
function groupKey(r) {
  const base = r.danceId || r.danceName;
  if (!r.isSongSwap) return base;
  return `${base}::swap::${(r.swapSongName || '').toLowerCase().trim()}`;
}

function buildPendingGroups(pending, queue, lastPlayedAt = {}, playsPerClient = {}) {
  const queuedKeys = new Set(
    queue.map(groupKey).filter(Boolean)
  );

  const map = {};
  for (const r of pending) {
    const key = groupKey(r);
    if (queuedKeys.has(key)) continue; // already queued — hide from pending panel
    if (!map[key]) {
      map[key] = {
        key,
        danceId: r.danceId,
        danceName: r.danceName,
        songName: r.songName,
        artist: r.artist,
        difficulty: r.difficulty,
        stepsheet: r.stepsheet,
        danceType: r.danceType,
        partnerStyle: r.partnerStyle,
        spotifyUri: r.spotifyUri,
        isSongSwap: !!r.isSongSwap,
        swapSongName: r.swapSongName ?? null,
        swapArtist: r.swapArtist ?? null,
        isRepeat: false,
        requests: [],
      };
    }
    map[key].requests.push(r);
    if (r.isRepeat) map[key].isRepeat = true;
  }

  return Object.values(map)
    .map(g => {
      const playedAt = lastPlayedAt[g.danceId || g.danceName];
      const displayCount = playedAt
        ? g.requests.filter(r => new Date(r.createdAt) > new Date(playedAt)).length
        : g.requests.length;
      const score = computeScore(g.requests, playsPerClient);
      const totalTipCents = g.requests.reduce((sum, r) => sum + (r.tipCents ?? 0), 0);
      return { ...g, displayCount, score, totalTipCents };
    })
    .sort((a, b) => b.score - a.score);
}

module.exports = { buildPendingGroups };
