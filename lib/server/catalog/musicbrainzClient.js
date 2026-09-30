'use strict';
/**
 * Minimal MusicBrainz web-service client for on-demand catalog lookups.
 *
 * MusicBrainz allows ~1 request/second per IP and asks every client to
 * identify itself (User-Agent with a contact). All lookups from this server
 * share one throttle; a lookup that couldn't start within `maxWaitMs` is
 * skipped rather than queued, so a burst of attendee typing never builds a
 * backlog.
 *
 * The throttle is per server process. That is fine for one server; several
 * instances would each get their own 1/second budget.
 */

const API = 'https://musicbrainz.org/ws/2';
const MIN_GAP_MS = 1100;
// MusicBrainz's maximum page size. Exact-title matches all score the same, so
// the well-known version can be anywhere among them; fetching wide and
// ranking by listen count is what finds it.
const PAGE_SIZE = 100;

/**
 * Lucene query for MusicBrainz recording search. Every word must appear in
 * the recording title or artist (the last may be a prefix), and titles
 * containing the whole phrase are boosted — prefix terms alone score every
 * match equally, which returns results in arbitrary order.
 * `words` must already be normalised (letters/digits only, so no escaping).
 */
function recordingQuery(words) {
  const perWord = words
    .map((w, i) => {
      const terms = [`recording:${w}`, `artist:${w}`];
      if (i === words.length - 1 && w.length >= 3) terms.push(`recording:${w}*`, `artist:${w}*`);
      return `(${terms.join(' OR ')})`;
    })
    .join(' AND ');
  return `recording:"${words.join(' ')}"^5 OR (${perWord})`;
}

function createMusicBrainzClient({ contact, fetchImpl = fetch, now = Date.now, maxWaitMs = 1500 } = {}) {
  if (!contact) return null;
  const userAgent = `LineDanceDJFeed/0.1 ( ${contact} )`;
  let nextSlot = 0;

  /** Reserve the next request slot, or null if it's too far away. */
  function reserve() {
    const t = now();
    const start = Math.max(t, nextSlot);
    if (start - t > maxWaitMs) return null;
    nextSlot = start + MIN_GAP_MS;
    return start - t;
  }

  /** One page of results, or null when skipped (throttled or failed). */
  async function fetchPage(query, offset) {
    const wait = reserve();
    if (wait === null) return null;
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    const url = `${API}/recording?query=${encodeURIComponent(query)}&limit=${PAGE_SIZE}&offset=${offset}&fmt=json`;
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
      if (!res.ok) {
        // 503 = MusicBrainz is rate limiting us; back off for a few seconds.
        if (res.status === 503) nextSlot = Math.max(nextSlot, now() + 5000);
        return null;
      }
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Recordings matching `words` (up to `maxPages` pages of 100), or null if
   * even the first page was skipped. Failures are swallowed: the catalog
   * fallback must never break search.
   */
  async function searchRecordings(words, { maxPages = 2 } = {}) {
    const query = recordingQuery(words);
    const recordings = [];
    for (let page = 0; page < maxPages; page++) {
      const data = await fetchPage(query, page * PAGE_SIZE);
      if (!data) return page === 0 ? null : recordings; // keep what we got
      const batch = data.recordings ?? [];
      recordings.push(...batch);
      if (batch.length < PAGE_SIZE || recordings.length >= (data.count ?? 0)) break;
    }
    return recordings;
  }

  return { searchRecordings };
}

module.exports = { recordingQuery, createMusicBrainzClient, MIN_GAP_MS, PAGE_SIZE };
