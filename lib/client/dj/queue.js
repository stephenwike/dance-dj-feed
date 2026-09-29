'use strict';
/**
 * Shared vocabulary for grouping and ordering requests. Every view that counts
 * requesters, sums beats or scores a dance must key requests the same way, or
 * the numbers on the controller, feed and attendee app drift apart.
 */

// Statuses that still represent live demand for a dance.
const ACTIVE_STATUSES = ['pending', 'approved', 'playing'];

function isActive(r) {
  return ACTIVE_STATUSES.includes(r.status);
}

/**
 * Identity of the dance a request is for.
 *
 * Line dances are keyed by normalised name, not danceId: some requests are
 * submitted without an id (free-form, panel "+1"), and keying by id would
 * split one dance into several groups.
 *
 * Partner dances are each unique; upvotes point at the original request via
 * partnerGroupId, so the group key is partnerGroupId || _id.
 */
function danceKey(r) {
  if (r.danceType === 'partner') return String(r.partnerGroupId || r._id);
  return (r.danceName || '').toLowerCase().trim();
}

/** Approved requests in play order. */
function sortedQueue(requests) {
  return requests
    .filter(r => r.status === 'approved')
    .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
}

/** The request that plays after the current one, or null. */
function nextInQueue(requests) {
  return sortedQueue(requests)[0] ?? null;
}

module.exports = { ACTIVE_STATUSES, isActive, danceKey, sortedQueue, nextInQueue };
