'use strict';
// Business logic for DJ request creation, extracted for testability.
// Exported as CJS so Jest can require() it directly without a transpiler.
// The ESM API route imports the named exports via interop.
const { DB_NAME, escapeRegex } = require('../db');
const { effectiveDurationMs } = require('../../dj/tempo');
const { getTrack } = require('../catalog/trackCatalog');

// A DJ's active session. Always scoped to an owner: an unscoped lookup would
// return whichever DJ's session happens to come first.
async function getActiveSession(client, ownerId) {
  if (!ownerId) return null;
  return client.db(DB_NAME).collection('dj_sessions').findOne({ status: 'active', ownerId });
}

/**
 * Fill in each request's song details from its catalog dance (ldco): length,
 * Spotify URI and ISRC (which lets the local-files player find the exact
 * recording). A song swap plays a different song, so it keeps its own
 * details rather than the dance's usual song.
 */
async function joinDurations(client, requests) {
  if (!requests.length) return requests;
  const ldco = client.db('ldco');
  const danceIds = [...new Set(requests.map(r => r.danceId).filter(Boolean))];
  const dances = danceIds.length
    ? await ldco.collection('dances').find({ _id: { $in: danceIds } }).project({ primaryTrack: 1 }).toArray()
    : [];
  const trackIds = [...new Set(dances.map(d => d.primaryTrack).filter(Boolean))];
  const tracks = trackIds.length
    ? await ldco.collection('tracks').find({ _id: { $in: trackIds } }).project({ duration_ms: 1, uri: 1, isrc: 1 }).toArray()
    : [];
  const danceToTrack = Object.fromEntries(dances.map(d => [String(d._id), String(d.primaryTrack)]));
  const trackById = Object.fromEntries(tracks.map(t => [String(t._id), t]));
  return requests.map(r => {
    const track = r.isSongSwap ? null : trackById[danceToTrack[r.danceId]];
    const isrcs = r.isrcs?.length ? r.isrcs : (track?.isrc ? [String(track.isrc).toUpperCase()] : []);
    return {
      ...r,
      _id: String(r._id),
      // Preserve explicitly-set duration_ms (e.g. in-queue messages, swaps) if
      // no track to join. Served durations are wall-clock, so a slowed-down
      // track runs longer.
      duration_ms: effectiveDurationMs(track?.duration_ms ?? r.duration_ms ?? null, r.tempo),
      spotifyUri: r.spotifyUri ?? track?.uri ?? null,
      isrcs,
    };
  });
}

async function listRequests(client, sessionId = null, ownerId = null) {
  let sid = sessionId;
  if (!sid) {
    const session = await getActiveSession(client, ownerId);
    if (!session) return [];
    sid = String(session._id);
  }
  const col = client.db(DB_NAME).collection('dj_requests');
  const requests = await col
    .find({ sessionId: sid })
    .sort({ createdAt: -1 })
    .toArray();
  return joinDurations(client, requests);
}

/**
 * Create a request in `session`. The caller resolves the session and decides
 * who may write to it (see requestAccess.js); by the time we get here the body
 * has already been sanitised for the caller's role.
 */
async function createRequest(client, session, body) {
  const {
    danceId, danceName, songName, artist, difficulty, stepsheet,
    duration_ms, spotifyUri, localTrackKey, catalogTrackId, clientId, requesterName, notes,
    danceType: bodyDanceType,
    partnerStyle: bodyPartnerStyle,
    partnerGroupId: bodyPartnerGroupId,
    isSongSwap, swapSongName, swapArtist,
    tipCents,
    status: forcedStatus,
    queuePosition: forcedPos,
  } = body ?? {};
  const isPartner = bodyDanceType === 'partner';

  if (!danceName) throw Object.assign(new Error('danceName is required'), { statusCode: 400 });
  if (!session) throw Object.assign(new Error('Session not found'), { statusCode: 404 });

  const col = client.db(DB_NAME).collection('dj_requests');
  const sessionId = String(session._id);
  const ownerId = session.ownerId ?? null;

  // A song picked from the music catalog: its title, artist and length are
  // authoritative, and its ISRCs let the DJ's local-files player find the
  // exact recording. Unknown ids are ignored rather than trusted.
  const track = typeof catalogTrackId === 'string' && catalogTrackId ? await getTrack(client, catalogTrackId) : null;

  const danceMatch = danceId
    ? { danceId }
    : { danceName: { $regex: new RegExp(`^${escapeRegex(danceName)}$`, 'i') } };

  // Deduplicate: if this user already has an active request for the same
  // dance + swap variant, return it instead of inserting a duplicate.
  // Skipped for DJ-direct-add (forcedStatus is set) and anonymous requests.
  if (!forcedStatus && clientId) {
    if (isPartner && bodyPartnerGroupId) {
      // Upvote case: dedup by partnerGroupId so each partner dance is deduplicated
      // independently (two different partner dances with the same name stay separate).
      const existing = await col.findOne({
        sessionId, clientId,
        status: { $in: ['pending', 'approved', 'playing'] },
        partnerGroupId: bodyPartnerGroupId,
      });
      if (existing) return { ...existing, _id: String(existing._id) };
    } else if (!isPartner) {
      // Line dance: dedup by dance name/id + swap variant as before.
      const swapFilter = isSongSwap
        ? { isSongSwap: true, swapSongName: swapSongName ?? null }
        : { isSongSwap: { $ne: true } };
      const existing = await col.findOne({
        sessionId, clientId,
        status: { $in: ['pending', 'approved', 'playing'] },
        ...danceMatch,
        ...swapFilter,
      });
      if (existing) return { ...existing, _id: String(existing._id) };
    }
    // Independent partner dance submissions (no partnerGroupId): no dedup —
    // each is its own unique dance.
  }

  // Was this dance already played in this session?
  // Partner dances are never repeats — each group is a unique set of participants.
  let lastPlayed = null;
  if (!isPartner) {
    lastPlayed = await col.findOne(
      { sessionId, ...danceMatch, status: 'played' },
      { sort: { updatedAt: -1 } }
    );
  }

  // New requests from attendees always start as pending regardless of queue state.
  // The queue-card count badge shows how many people requested the same dance.
  // Callers (e.g. DJ adding from Spotify) may force a status/position explicitly.
  const resolvedStatus = forcedStatus ?? 'pending';
  const resolvedPos = forcedPos ?? (await lastQueuePosition(col, sessionId)) + 1;

  const doc = {
    sessionId,
    ownerId,
    danceId: danceId ?? null,
    danceName,
    songName: track?.title ?? (songName || ''),
    artist: track?.artist ?? (artist || ''),
    difficulty: difficulty || '',
    stepsheet: stepsheet || '',
    duration_ms: duration_ms ?? track?.durationMs ?? null,
    spotifyUri: spotifyUri ?? null,
    localTrackKey: toLocalTrackKey(localTrackKey),
    catalogTrackId: track?._id ?? null,
    isrcs: track?.isrcs ?? [],
    clientId: clientId || '',
    requesterName: requesterName || '',
    notes: notes || '',
    danceType: bodyDanceType ?? null,
    partnerStyle: bodyPartnerStyle ?? null,
    partnerGroupId: bodyPartnerGroupId ?? null,
    isSongSwap: !!isSongSwap,
    swapSongName: swapSongName ?? null,
    swapArtist: swapArtist ?? null,
    tipCents: Number.isFinite(tipCents) && tipCents > 0 ? Math.round(tipCents) : 0,
    isRepeat: !!lastPlayed,
    status: resolvedStatus,
    queuePosition: resolvedPos,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await col.insertOne(doc);
  return { ...doc, _id: String(result.insertedId) };
}

/**
 * A local-files plugin path ("Folder/Song.mp3", relative to the DJ's music
 * folder), or null. Bounded so a request can't carry an arbitrary blob.
 */
function toLocalTrackKey(v) {
  return typeof v === 'string' && v && v.length <= 1024 ? v : null;
}

/** Highest queuePosition among approved/playing items, or 0 for an empty queue. */
async function lastQueuePosition(col, sessionId) {
  const last = await col.findOne(
    { sessionId, status: { $in: ['approved', 'playing'] } },
    { sort: { queuePosition: -1 }, projection: { queuePosition: 1 } }
  );
  return last?.queuePosition ?? 0;
}

/**
 * When a dance is marked as played, mark every other request for that same
 * dance in the session as played too — regardless of current status.
 *
 * This covers:
 *   pending  — user requested it, it got played before the DJ approved it
 *   approved — user was in the queue but a sibling entry was the one promoted
 *   skipped  — user's request was denied, but the dance was played anyway
 *
 * We intentionally exclude already-played requests to avoid redundant writes.
 */
async function markSiblingsPlayed(col, thisReqId, danceMatch, sessionId) {
  return col.updateMany(
    {
      ...danceMatch,
      sessionId,
      _id: { $ne: thisReqId },
      status: { $in: ['pending', 'approved', 'skipped'] },
    },
    { $set: { status: 'played', updatedAt: new Date() } }
  );
}

/**
 * Build the MongoDB filter that selects sibling requests (same dance, same
 * variant) when marking played.
 *
 * Original plays → only other non-swap requests are matched.
 * Swap plays     → only requests with the same swap song are matched.
 *
 * This prevents playing Electric Slide (original) from wiping out the
 * queued Electric Slide + Boots On swap request, and vice versa.
 */
function buildSiblingDanceMatch(thisReq) {
  const base = thisReq.danceId
    ? { danceId: thisReq.danceId }
    : { danceName: thisReq.danceName };

  if (thisReq.isSongSwap) {
    return { ...base, isSongSwap: true, swapSongName: thisReq.swapSongName };
  }
  // $ne: true matches false, null, and absent field — covers legacy documents
  return { ...base, isSongSwap: { $ne: true } };
}

module.exports = { listRequests, createRequest, getActiveSession, markSiblingsPlayed, buildSiblingDanceMatch, toLocalTrackKey };

