'use strict';
const { ObjectId } = require('mongodb');
const DB_NAME = process.env.MONGODB_DB || 'djfeed';

async function generateSessionReport(client, sessionId) {
  const db = client.db(DB_NAME);
  const session = await db.collection('dj_sessions').findOne({ _id: new ObjectId(sessionId) });
  if (!session) return null;

  const requests = await db.collection('dj_requests')
    .find({ sessionId: String(sessionId) })
    .sort({ updatedAt: 1 })
    .toArray();

  const played = requests.filter(r => r.status === 'played' && r.danceType !== 'message');
  const trackMap = {};
  for (const r of played) {
    const key = r.danceId || r.danceName;
    if (!trackMap[key]) {
      trackMap[key] = {
        danceName: r.danceName,
        danceId: r.danceId,
        songName: r.songName,
        artist: r.artist,
        difficulty: r.difficulty,
        stepsheet: r.stepsheet,
        danceType: r.danceType,
        partnerStyle: r.partnerStyle,
        isSongSwap: r.isSongSwap || false,
        swapSongName: r.swapSongName,
        swapArtist: r.swapArtist,
        playedAt: r.updatedAt,
        requesters: [],
        totalTips: 0,
        requesterCount: 0,
      };
    }
    trackMap[key].requesters.push({
      clientId: r.clientId,
      requesterName: r.requesterName,
      tipCents: r.tipCents || 0,
    });
    trackMap[key].totalTips += r.tipCents || 0;
    trackMap[key].requesterCount += 1;
  }

  const playedTracks = Object.values(trackMap);

  const uniqueRequesters = new Set(
    requests.filter(r => r.danceType !== 'message' && r.clientId !== 'dj' && r.clientId !== 'spotify')
      .map(r => r.clientId)
  );

  const approved = requests.filter(r => ['approved', 'playing', 'played'].includes(r.status)).length;
  const skipped = requests.filter(r => r.status === 'skipped').length;
  const totalNonMessage = requests.filter(r => r.danceType !== 'message').length;

  const report = {
    sessionId: String(sessionId),
    ownerId: session.ownerId,
    sessionName: session.name,
    startedAt: session.startedAt,
    endsAt: session.endsAt,
    closedAt: session.closedAt,
    autoClosedAt: session.autoClosedAt || null,
    actualDurationMs: session.closedAt
      ? new Date(session.closedAt).getTime() - new Date(session.startedAt).getTime()
      : null,
    extensions: session.extensions || [],
    playedTracks,
    stats: {
      totalDancesPlayed: playedTracks.length,
      totalRequests: totalNonMessage,
      totalApproved: approved,
      totalSkipped: skipped,
      totalPending: requests.filter(r => r.status === 'pending').length,
      approvalRate: approved + skipped > 0 ? +(approved / (approved + skipped)).toFixed(2) : null,
      totalTipCents: requests.reduce((sum, r) => sum + (r.tipCents || 0), 0),
      uniqueRequesters: uniqueRequesters.size,
    },
    generatedAt: new Date(),
  };

  await db.collection('session_reports').updateOne(
    { sessionId: report.sessionId },
    { $set: report },
    { upsert: true },
  );

  return report;
}

async function generateRequesterHistory(client, sessionId) {
  const db = client.db(DB_NAME);
  const session = await db.collection('dj_sessions').findOne({ _id: new ObjectId(sessionId) });
  if (!session) return;

  const requests = await db.collection('dj_requests')
    .find({ sessionId: String(sessionId), danceType: { $ne: 'message' }, clientId: { $nin: ['dj', 'spotify'] } })
    .toArray();

  const byClient = {};
  for (const r of requests) {
    if (!r.clientId) continue;
    if (!byClient[r.clientId]) {
      byClient[r.clientId] = {
        clientId: r.clientId,
        requesterName: r.requesterName,
        sessionId: String(sessionId),
        ownerId: session.ownerId,
        sessionName: session.name,
        sessionDate: session.startedAt,
        requests: [],
      };
    }
    byClient[r.clientId].requests.push({
      danceName: r.danceName,
      danceId: r.danceId,
      status: r.status,
      tipCents: r.tipCents || 0,
      createdAt: r.createdAt,
    });
  }

  const col = db.collection('requester_history');
  for (const doc of Object.values(byClient)) {
    await col.updateOne(
      { clientId: doc.clientId, sessionId: doc.sessionId },
      { $set: doc },
      { upsert: true },
    );
  }
}

async function cleanupSessionRequests(client, sessionId) {
  const db = client.db(DB_NAME);
  const result = await db.collection('dj_requests').deleteMany({ sessionId: String(sessionId) });
  return { deletedCount: result.deletedCount };
}

async function normalizeSession(client, sessionId) {
  const db = client.db(DB_NAME);
  const existing = await db.collection('session_reports').findOne({ sessionId: String(sessionId) });
  if (existing) return existing;

  // Draft sessions were never started — nothing to normalize.
  const sessionDoc = await db.collection('dj_sessions').findOne({ _id: new ObjectId(sessionId) });
  if (!sessionDoc?.startedAt) return null;

  const report = await generateSessionReport(client, sessionId);
  if (!report) return null;

  await generateRequesterHistory(client, sessionId);
  await cleanupSessionRequests(client, sessionId);

  return report;
}

module.exports = { generateSessionReport, generateRequesterHistory, cleanupSessionRequests, normalizeSession };
