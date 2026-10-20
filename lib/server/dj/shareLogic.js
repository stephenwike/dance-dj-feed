'use strict';
/**
 * Shareable session reports: a DJ turns on a link for one of their sessions
 * (its playlist and stats), and anyone with the link can view it without
 * signing in — e.g. posted to a WhatsApp group, with a stats cover image.
 *
 * The link is an unguessable token stored on the session (`shareToken`).
 * Turning sharing off removes it, so old links stop working; turning it
 * back on makes a new one.
 *
 * The public view leaves out who requested what and any tips: only the
 * dances, their songs, how many people asked for each, and totals.
 *
 * Dates on the page and image are shown in the DJ's time zone, saved from
 * their browser when they turn the link on (`shareTimeZone`).
 */
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { findAccountById } = require('../ldco/users');

const DB_NAME = process.env.MONGODB_DB || 'djfeed';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16}$/;
// Most-requested dances shown on the cover image.
const TOP_DANCES = 3;

function newShareToken() {
  return crypto.randomBytes(12).toString('base64url'); // 16 characters
}

function isShareToken(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

/** `tz` if it's a time zone this server knows, else null. */
function validTimeZone(tz) {
  if (typeof tz !== 'string' || !tz) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return null; }
}

function sessions(client) {
  return client.db(DB_NAME).collection('dj_sessions');
}

/**
 * The session's share token, created if it has none. Null if not the
 * owner's (or never started). `timeZone` is the DJ's (from their browser).
 */
async function enableSharing(client, ownerId, sessionId, timeZone) {
  if (!ObjectId.isValid(sessionId)) return null;
  const _id = new ObjectId(sessionId);
  const session = await sessions(client).findOne({ _id, ownerId }, { projection: { shareToken: 1, startedAt: 1 } });
  if (!session?.startedAt) return null;
  const tz = validTimeZone(timeZone);
  if (tz) await sessions(client).updateOne({ _id, ownerId }, { $set: { shareTimeZone: tz } });
  if (session.shareToken) return session.shareToken;
  const token = newShareToken();
  await sessions(client).updateOne({ _id, ownerId, shareToken: { $exists: false } }, { $set: { shareToken: token } });
  // Another tab may have turned it on at the same moment: use whichever won.
  const after = await sessions(client).findOne({ _id }, { projection: { shareToken: 1 } });
  return after.shareToken;
}

/** Turn the link off; it stops working at once. */
async function disableSharing(client, ownerId, sessionId) {
  if (!ObjectId.isValid(sessionId)) return false;
  const result = await sessions(client).updateOne({ _id: new ObjectId(sessionId), ownerId }, { $unset: { shareToken: '' } });
  return result.matchedCount > 0;
}

/**
 * Played dances in play order, one per dance (repeat plays merged), with how
 * many requests each had. Works on a closed session's saved report tracks or
 * a live session's played requests.
 */
function publicTracks(report, playedRequests) {
  if (report?.playedTracks) {
    return report.playedTracks
      .map(t => ({ ...t, requests: t.requesterCount ?? 0 }))
      .sort((a, b) => new Date(a.playedAt) - new Date(b.playedAt));
  }
  const byDance = {};
  for (const r of playedRequests) {
    if (r.danceType === 'message') continue;
    const key = r.danceId || r.danceName;
    const t = byDance[key] ??= { ...r, playedAt: r.updatedAt, requests: 0 };
    t.requests += 1;
    if (new Date(r.updatedAt) < new Date(t.playedAt)) t.playedAt = r.updatedAt;
  }
  return Object.values(byDance).sort((a, b) => new Date(a.playedAt) - new Date(b.playedAt));
}

/** A request made by a dancer (not added by the DJ). */
function fromDancer(r) {
  return r.danceType !== 'message' && r.clientId && r.clientId !== 'dj' && r.clientId !== 'spotify';
}

/**
 * The public report for a session: safe to show anyone with the link.
 * `report` is the saved report (closed sessions), or null; `requests` the
 * session's requests while they still exist (live or not yet normalized).
 */
function toPublicReport({ session, report, requests = [], hostName = '' }) {
  const played = requests.filter(r => r.status === 'played');
  const tracks = publicTracks(report, played).map(t => ({
    danceName: t.danceName,
    songName: t.isSongSwap ? (t.swapSongName || t.songName || '') : (t.songName || ''),
    artist: t.isSongSwap ? (t.swapArtist || t.artist || '') : (t.artist || ''),
    difficulty: t.difficulty || '',
    danceType: t.danceType || null,
    partnerStyle: t.partnerStyle || null,
    stepsheet: t.stepsheet || '',
    playedAt: t.playedAt ? new Date(t.playedAt).toISOString() : null,
    requests: t.requests,
  }));

  const stats = report?.stats
    ? { requests: report.stats.totalRequests, dancers: report.stats.uniqueRequesters }
    : {
      requests: requests.filter(r => r.danceType !== 'message').length,
      dancers: new Set(requests.filter(fromDancer).map(r => r.clientId)).size,
    };

  const endedAt = session.closedAt ?? null;
  const topDances = tracks
    .filter(t => t.requests > 0)
    .sort((a, b) => b.requests - a.requests)
    .slice(0, TOP_DANCES)
    .map(t => ({ danceName: t.danceName, requests: t.requests }));

  return {
    name: session.name,
    hostName,
    timeZone: validTimeZone(session.shareTimeZone) ?? 'UTC',
    live: session.status === 'active',
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: endedAt ? new Date(endedAt).toISOString() : null,
    durationMs: endedAt ? new Date(endedAt) - new Date(session.startedAt) : null,
    stats: {
      dances: tracks.length,
      lineDances: tracks.filter(t => t.danceType !== 'partner').length,
      partnerDances: tracks.filter(t => t.danceType === 'partner').length,
      requests: stats.requests,
      dancers: stats.dancers,
    },
    topDances,
    tracks,
  };
}

/** The public report behind a share link, or null if the link isn't (or is no longer) valid. */
async function getSharedReport(client, token) {
  if (!isShareToken(token)) return null;
  const db = client.db(DB_NAME);
  const session = await sessions(client).findOne({ shareToken: token });
  if (!session?.startedAt) return null;
  const sessionId = String(session._id);
  const [report, account] = await Promise.all([
    db.collection('session_reports').findOne({ sessionId }),
    findAccountById(client, session.ownerId).catch(() => null),
  ]);
  const requests = report ? [] : await db.collection('dj_requests').find({ sessionId }).toArray();
  return toPublicReport({ session, report, requests, hostName: account?.name ?? '' });
}

module.exports = { newShareToken, isShareToken, validTimeZone, enableSharing, disableSharing, toPublicReport, getSharedReport };
