'use strict';
/**
 * Search the line-dance catalog (ldco, as served by /api/dj/dances) for the
 * DJ's Add to Queue fields.
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

/**
 * Dances matching `query` in any field, the typed-in field first: e.g. in
 * the Dance Name box, dance-name matches, then dances whose song matches,
 * then whose artist matches. A dance appears once, under the first field it
 * matched. Each result is { dance, matchedOn }.
 *
 * A DJ often types the song into the dance box (or the reverse); this keeps
 * real catalog dances ahead of anything looked up elsewhere.
 */
function searchDancesAnyField(dances, primaryField, query, limit = 8) {
  if (!SEARCH_FIELDS.includes(primaryField)) throw new Error(`Unknown dance search field: ${primaryField}`);
  const order = [primaryField, ...SEARCH_FIELDS.filter(f => f !== primaryField)];
  const seen = new Set();
  const out = [];
  for (const field of order) {
    for (const dance of searchDances(dances, field, query, dances.length)) {
      const id = dance.id ?? dance._id;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ dance, matchedOn: field });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

module.exports = { SEARCH_FIELDS, searchDances, searchDancesAnyField };
