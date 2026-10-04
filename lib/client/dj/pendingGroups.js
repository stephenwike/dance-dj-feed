'use strict';
const { computeScore } = require('./fairnessScore');
const { danceKey } = require('./queue');

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
  const base = danceKey(r);
  if (r.danceType === 'partner' || !r.isSongSwap) return base;
  return `${base}::swap::${(r.swapSongName || '').toLowerCase().trim()}`;
}

function buildPendingGroups(pending, queue, lastPlayedAt = {}, playsPerClient = {}, options = {}) {
  const fairness = options.fairness !== false;
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
      const playedAt = lastPlayedAt[danceKey(g.requests[0])];
      const displayCount = playedAt
        ? g.requests.filter(r => new Date(r.createdAt) > new Date(playedAt)).length
        : g.requests.length;
      const score = fairness
        ? computeScore(g.requests, playsPerClient)
        : g.requests.length;
      const totalTipCents = g.requests.reduce((sum, r) => sum + (r.tipCents ?? 0), 0);
      return { ...g, displayCount, score, totalTipCents };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * The Line/Partner filter only means something while both kinds of request
 * are pending. Once one kind is gone (e.g. the last partner dance was
 * queued), the filter buttons disappear — and a filter left on 'partner'
 * would show an empty list with no way to change it. So it falls back to
 * 'all'.
 *
 * @returns {{ showFilter: boolean, filter: 'all'|'line'|'partner' }}
 */
function effectivePendingFilter(groups, chosen) {
  const hasPartner = groups.some(g => g.danceType === 'partner');
  const hasLine = groups.some(g => g.danceType !== 'partner');
  const showFilter = hasPartner && hasLine;
  return { showFilter, filter: showFilter ? chosen : 'all' };
}

/** Groups matching a filter from effectivePendingFilter. */
function filterPendingGroups(groups, filter) {
  if (filter === 'line') return groups.filter(g => g.danceType !== 'partner');
  if (filter === 'partner') return groups.filter(g => g.danceType === 'partner');
  return groups;
}

module.exports = { buildPendingGroups, effectivePendingFilter, filterPendingGroups };
