'use strict';
/**
 * Which dancers dance with which hosts — recorded here, used by Line Dance
 * Manager (e.g. so an instructor can see what their dancers have wishlisted).
 *
 * A signed-in dancer opening a host's live event on the requester app is
 * the proof they were there, so that's when we record it. This app only
 * records the facts; the manager decides what to show (recent dancers only,
 * anonymous counts, links to venues, …).
 *
 * Both collections live in the shared `ldco` database, keyed by the shared
 * account ids (the host is the session's ownerId), in the manager's document
 * style (string _id, Date timestamps):
 *
 *   session_attendance  one per dancer per event
 *     { _id, sessionId, hostId, userId, firstSeenAt, lastSeenAt }
 *     unique (sessionId, userId)
 *
 *   host_dancers        one per host and dancer, summarising the above
 *     { _id, hostId, userId, firstSeenAt, lastSeenAt, sessionCount, lastSessionId }
 *     unique (hostId, userId)
 */
const { ObjectId } = require('mongodb');

const LDCO_DB = 'ldco';
const ATTENDANCE = 'session_attendance';
const HOST_DANCERS = 'host_dancers';

function collections(client) {
  const db = client.db(LDCO_DB);
  return { attendance: db.collection(ATTENDANCE), hostDancers: db.collection(HOST_DANCERS) };
}

/**
 * Record that `userId` is at `session` (a live dj_sessions document).
 * Safe to call on every page load: repeat visits only move lastSeenAt, and
 * sessionCount counts each event once. A host viewing their own event isn't
 * recorded. Returns { recorded, firstVisit }.
 */
async function recordAttendance(client, { session, userId, now = new Date() }) {
  if (!session || !userId) return { recorded: false };
  const hostId = session.ownerId;
  if (!hostId || hostId === userId) return { recorded: false };
  const sessionId = String(session._id);
  const { attendance, hostDancers } = collections(client);

  const visit = await attendance.updateOne(
    { sessionId, userId },
    {
      $setOnInsert: { _id: new ObjectId().toString(), sessionId, hostId, userId, firstSeenAt: now },
      $set: { lastSeenAt: now },
    },
    { upsert: true },
  );
  const firstVisit = visit.upsertedCount > 0;

  await hostDancers.updateOne(
    { hostId, userId },
    {
      $setOnInsert: { _id: new ObjectId().toString(), hostId, userId, firstSeenAt: now },
      $set: { lastSeenAt: now, lastSessionId: sessionId },
      $inc: { sessionCount: firstVisit ? 1 : 0 },
    },
    { upsert: true },
  );
  return { recorded: true, firstVisit };
}

/** Indexes for the two collections (unique keys plus the lookups the manager will do). */
async function ensureHostDancerIndexes(client) {
  const { attendance, hostDancers } = collections(client);
  await Promise.all([
    attendance.createIndex({ sessionId: 1, userId: 1 }, { unique: true }),
    attendance.createIndex({ hostId: 1, lastSeenAt: -1 }),
    hostDancers.createIndex({ hostId: 1, userId: 1 }, { unique: true }),
    hostDancers.createIndex({ userId: 1 }),
  ]);
}

module.exports = { ATTENDANCE, HOST_DANCERS, recordAttendance, ensureHostDancerIndexes };
