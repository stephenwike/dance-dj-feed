'use strict';
/**
 * Word-by-word text search for dances on the requester app: every word typed
 * must appear somewhere in what we know about the dance — its name, song,
 * artist, difficulty and choreographers (plus anything else passed in) — in
 * any order. Case, accents and punctuation don't matter: "dont" finds
 * "Don't", "earle copperhead" finds Copperhead Road by Steve Earle, and
 * "beginner waltz" finds beginner waltzes.
 *
 * Results are ranked by where the match is (searchRank): the dance's name
 * first, then its song or artist, then its choreographers, then anything
 * else — so "fre" shows Freaky Skillz before Fred Whitehouse's dances.
 */

/** Lowercase, without accents or punctuation, single-spaced. */
function normalizeSearchText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')          // don't → dont
    .replace(/[^a-z0-9]+/g, ' ')    // other punctuation separates words
    .trim();
}

function queryWords(query) {
  const q = normalizeSearchText(query);
  return q ? q.split(' ') : [];
}

/**
 * What a dance can be found by, by field (each normalized):
 * { name, songArtist, people, other }. `extra` (e.g. a favorite's status)
 * goes in `other` with the difficulty.
 */
function danceSearchFields(dance, ...extra) {
  return {
    name: normalizeSearchText(dance.danceName),
    songArtist: normalizeSearchText(`${dance.songName ?? ''} ${dance.artist ?? ''}`),
    people: normalizeSearchText((dance.choreographers ?? []).join(' ')),
    other: normalizeSearchText([dance.difficulty, ...extra].filter(Boolean).join(' ')),
  };
}

/** Everything searchable about a dance in one normalized string. */
function danceSearchText(dance, ...extra) {
  const f = danceSearchFields(dance, ...extra);
  return [f.name, f.songArtist, f.people, f.other].filter(Boolean).join(' ');
}

/** Whether every word of `query` is in `text` (already normalized). A blank query matches. */
function matchesAllWords(text, query) {
  return queryWords(query).every(w => text.includes(w));
}

// How well one field matches: 0 it starts with what was typed, 1 every word
// typed starts a word in it, 2 it contains every word; null if not all there.
function fieldMatch(text, words, phrase) {
  if (!text || !words.every(w => text.includes(w))) return null;
  if (text.startsWith(phrase)) return 0;
  const tokens = text.split(' ');
  if (words.every(w => tokens.some(t => t.startsWith(w)))) return 1;
  return 2;
}

// Which field matched, best first: each tier spans three fieldMatch levels.
const TIERS = ['name', 'songArtist', 'people'];
const OTHER_RANK = TIERS.length * 3;      // difficulty / extra only
const SPREAD_RANK = OTHER_RANK + 1;       // the words are spread over fields

/**
 * Where `query` matches, as a rank (lower is better), or null when it
 * doesn't match at all. A blank query ranks 0. `fields` is from
 * danceSearchFields.
 */
function searchRank(fields, query) {
  const words = queryWords(query);
  if (!words.length) return 0;
  const phrase = words.join(' ');
  for (let i = 0; i < TIERS.length; i++) {
    const m = fieldMatch(fields[TIERS[i]], words, phrase);
    if (m !== null) return i * 3 + m;
  }
  if (fieldMatch(fields.other, words, phrase) !== null) return OTHER_RANK;
  const all = [fields.name, fields.songArtist, fields.people, fields.other].join(' ');
  return words.every(w => all.includes(w)) ? SPREAD_RANK : null;
}

/** Whether a catalog dance matches `query`. */
function danceMatches(dance, query) {
  return searchRank(danceSearchFields(dance), query) !== null;
}

/**
 * The entries matching `query`, best match first; ties keep their order.
 * `fieldsOf(entry)` gives each one's danceSearchFields.
 */
function rankBySearch(entries, query, fieldsOf) {
  if (!queryWords(query).length) return entries;
  return entries
    .map((entry, index) => ({ entry, index, rank: searchRank(fieldsOf(entry), query) }))
    .filter(r => r.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(r => r.entry);
}

/** Catalog dances matching `query`, best match first. */
function searchDances(dances, query) {
  return rankBySearch(dances, query, d => danceSearchFields(d));
}

module.exports = {
  normalizeSearchText, queryWords, danceSearchFields, danceSearchText, matchesAllWords,
  searchRank, danceMatches, rankBySearch, searchDances,
};
