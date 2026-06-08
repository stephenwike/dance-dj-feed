'use strict';
// Business logic for DJ request creation, extracted for testability.
// Exported as CJS so Jest can require() it directly without a transpiler.
// The ESM API route imports the named exports via interop.
const { ObjectId } = require('mongodb');
const DB_NAME = process.env.MONGODB_DB || 'djfeed';

async function getActiveSession(client, ownerId = null) {
  const filter = { status: 'active' };
  if (ownerId) filter.ownerId = ownerId;
  return client.db(DB_NAME).collection('dj_sessions').findOne(filter);
}

async function joinDurations(client, requests) {
  if (!requests.length) return requests;
  const ldco = client.db('ldco');
  const danceIds = [...new Set(requests.map(r => r.danceId).filter(Boolean))];
  const dances = danceIds.length
    ? await ldco.collection('dances').find({ _id: { $in: danceIds } }).project({ primaryTrack: 1 }).toArray()
    : [];
  const trackIds = [...new Set(dances.map(d => d.primaryTrack).filter(Boolean))];
  const tracks = trackIds.length
    ? await ldco.collection('tracks').find({ _id: { $in: trackIds } }).project({ duration_ms: 1, uri: 1 }).toArray()
    : [];
  const danceToTrack = Object.fromEntries(dances.map(d => [String(d._id), String(d.primaryTrack)]));
  const trackDuration = Object.fromEntries(tracks.map(t => [String(t._id), t.duration_ms]));
  const trackUri = Object.fromEntries(tracks.map(t => [String(t._id), t.uri ?? null]));
  return requests.map(r => {
    const tid = danceToTrack[r.danceId];
    return {
      ...r,
      _id: String(r._id),
      // Preserve explicitly-set duration_ms (e.g. in-queue messages) if no track to join
      duration_ms: trackDuration[tid] ?? r.duration_ms ?? null,
      spotifyUri: r.spotifyUri ?? trackUri[tid] ?? null,
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

async function createRequest(client, body) {
  const {
    danceId, danceName, songName, artist, difficulty, stepsheet,
    duration_ms, spotifyUri, clientId, requesterName, notes,
    danceType: bodyDanceType,
    isSongSwap, swapSongName, swapArtist,
    tipCents,
    status: forcedStatus,
    queuePosition: forcedPos,
  } = body ?? {};

  if (!danceName) throw Object.assign(new Error('danceName is required'), { statusCode: 400 });

  const col = client.db(DB_NAME).collection('dj_requests');
  let session;
  if (body?.sessionId) {
    try {
      session = await client.db(DB_NAME).collection('dj_sessions').findOne({ _id: new ObjectId(body.sessionId) });
    } catch { session = null; }
  } else {
    session = await getActiveSession(client);
  }
  const sessionId = session ? String(session._id) : null;
  const ownerId = session?.ownerId ?? null;

  const danceMatch = danceId
    ? { danceId }
    : { danceName: { $regex: new RegExp(`^${danceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } };

  // Was this dance already played in this session?
  const lastPlayed = await col.findOne(
    { sessionId, ...danceMatch, status: 'played' },
    { sort: { updatedAt: -1 } }
  );

  // Next available queue position (for approved/playing items only)
  const approved = await col
    .find({ sessionId, status: { $in: ['approved', 'playing'] } })
    .toArray();
  const maxPos = approved.reduce((max, r) => Math.max(max, r.queuePosition ?? 0), 0);

  // New requests from attendees always start as pending regardless of queue state.
  // The queue-card count badge shows how many people requested the same dance.
  // Callers (e.g. DJ adding from Spotify) may force a status/position explicitly.
  const resolvedStatus = forcedStatus ?? 'pending';
  const resolvedPos = forcedPos ?? (maxPos + 1);

  const doc = {
    sessionId,
    ownerId,
    danceId: danceId ?? null,
    danceName,
    songName: songName || '',
    artist: artist || '',
    difficulty: difficulty || '',
    stepsheet: stepsheet || '',
    duration_ms: duration_ms ?? null,
    spotifyUri: spotifyUri ?? null,
    clientId: clientId || '',
    requesterName: requesterName || '',
    notes: notes || '',
    danceType: bodyDanceType ?? null,
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

module.exports = { listRequests, createRequest, markSiblingsPlayed, buildSiblingDanceMatch };

