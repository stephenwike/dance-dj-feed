'use strict';
// Access rules for dj_requests, kept free of I/O so they can be unit tested.
//
// Two kinds of caller hit the request endpoints:
//   owner    — the signed-in DJ who owns the session (controller, feed)
//   attendee — anyone else, identified only by a clientId (device id or user id)

const SYSTEM_CLIENT_IDS = new Set(['dj', 'spotify']);

// Fields only the session owner may set when creating a request. Attendees
// must not be able to self-approve, jump the queue, fake a tip, or pick a
// file from the DJ's local music folder.
const OWNER_ONLY_CREATE_FIELDS = ['status', 'queuePosition', 'tipCents', 'localTrackKey'];

// An attendee may withdraw their own request until it starts playing.
const ATTENDEE_REMOVABLE_STATUSES = ['pending', 'approved'];

function isSessionOwner(session, userId) {
  return !!userId && !!session && session.ownerId === userId;
}

/**
 * Strip privileged fields from a create-request body for non-owners, and stop
 * attendees from posing as a system requester.
 */
function sanitizeCreateBody(body, { isOwner }) {
  const clean = { ...(body ?? {}) };
  if (isOwner) return clean;
  for (const field of OWNER_ONLY_CREATE_FIELDS) delete clean[field];
  if (SYSTEM_CLIENT_IDS.has(clean.clientId)) delete clean.clientId;
  return clean;
}

/**
 * Why an attendee may not create a request in this session, or null if they may.
 * Owners are never blocked here (they can pre-load drafts and add while paused).
 */
function createBlockedReason(session, clientId, { isOwner }) {
  if (!session) return 'Session not found';
  if (isOwner) return null;
  if (session.status !== 'active') return 'Session is not active';
  if (session.requestsEnabled === false) return 'Requests are paused';
  if (clientId && (session.suppressedClientIds ?? []).includes(clientId)) return 'Requests are paused for this device';
  return null;
}

// Fields only the session's DJ may see. localTrackKey is where the song sits
// in the DJ's music folder ("Partner/Artist - Song.mp3"): private to the DJ,
// and useless to anyone else.
const DJ_ONLY_FIELDS = ['localTrackKey'];

/** A request as a non-owner may see it: without DJ-only fields. */
function withoutDjOnlyFields(r) {
  if (!DJ_ONLY_FIELDS.some(f => f in r)) return r;
  const out = { ...r };
  for (const f of DJ_ONLY_FIELDS) delete out[f];
  return out;
}

/**
 * Requests as a non-owner may see them: without DJ-only fields, and without
 * other attendees' clientIds. A clientId is the only credential an anonymous
 * attendee has (it unlocks their DMs and lets them withdraw their requests),
 * so it must never be broadcast to other devices.
 */
function redactForViewer(requests, viewerClientId) {
  return requests.map(req => {
    const r = withoutDjOnlyFields(req);
    if (!r.clientId || r.clientId === viewerClientId || SYSTEM_CLIENT_IDS.has(r.clientId)) return r;
    const { clientId, ...rest } = r;
    return rest;
  });
}

module.exports = {
  SYSTEM_CLIENT_IDS,
  OWNER_ONLY_CREATE_FIELDS,
  ATTENDEE_REMOVABLE_STATUSES,
  isSessionOwner,
  sanitizeCreateBody,
  createBlockedReason,
  DJ_ONLY_FIELDS,
  withoutDjOnlyFields,
  redactForViewer,
};
