'use strict';
/**
 * Search the line-dance catalog (ldco, as served by /api/dj/dances) by one
 * field — dance name, song or artist — for the DJ's Add to Queue fields.
 */

const SEARCH_FIELDS = ['danceName', 'songName', 'artist'];

/**
 * Dances whose `field` contains `query` (case-insensitive), those starting
 * with it first. Empty for a blank query.
 */
function searchDances(dances, field, query, limit = 8) {
  if (!SEARCH_FIELDS.includes(field)) throw new Error(`Unknown dance search field: ${field}`);
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const d of dances) {
    const v = (d[field] ?? '').toLowerCase();
    if (v.startsWith(q)) starts.push(d);
    else if (v.includes(q)) contains.push(d);
  }
  return [...starts, ...contains].slice(0, limit);
}

module.exports = { SEARCH_FIELDS, searchDances };
