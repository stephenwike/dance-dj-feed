'use strict';

/**
 * Build the "By Requester" pending groups shown in the right panel.
 * Groups every request (any status) by clientId, falling back to
 * requesterName, then 'anon'.
 */
function buildRequesterGroups(rawRequests, resolvedNames = {}) {
  const map = {};
  for (const r of rawRequests) {
    const key = r.clientId || r.requesterName || 'anon';
    if (!map[key]) {
      map[key] = {
        key,
        clientId: r.clientId,
        displayName: resolvedNames[r.clientId] || r.requesterName || r.clientId || 'Anonymous',
        requests: [],
      };
    }
    map[key].requests.push(r);
  }
  return Object.values(map).map(g => ({
    ...g,
    requests: [...g.requests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    submitted: g.requests.length,
    fulfilled: g.requests.filter(r => r.status === 'played').length,
  })).sort((a, b) => b.submitted - a.submitted);
}

module.exports = { buildRequesterGroups };
