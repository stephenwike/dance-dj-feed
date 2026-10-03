import clientPromise, { DB_NAME } from '../../../../lib/server/mongodb';
import { markSiblingsPlayed, buildSiblingDanceMatch, toLocalTrackKey, toPlayLengthMs } from '../../../../lib/server/dj/requestLogic';
import { ATTENDEE_REMOVABLE_STATUSES } from '../../../../lib/server/dj/requestAccess';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/server/authOptions';
import { getSessionTimeState } from '../../../../lib/dj/sessionTimeState';
import { toObjectId } from '../../../../lib/server/db';
import { normalizeTempo } from '../../../../lib/dj/tempo';

// Fields the DJ may edit on a request. Each maps the raw body value to what is stored.
const EDITABLE_FIELDS = {
  status:        v => v,
  queuePosition: v => v,
  playStartedAt: v => new Date(v),
  pausedAt:      v => (v ? new Date(v) : null),
  danceType:     v => v,
  partnerStyle:  v => v,
  danceName:     v => v,
  danceId:       v => v ?? null,
  songName:      v => v,
  artist:        v => v,
  difficulty:    v => v,
  stepsheet:     v => v,
  duration_ms:   v => v ?? null,
  spotifyUri:    v => v ?? null,
  localTrackKey: toLocalTrackKey,
  tempo:         normalizeTempo,
  playLengthMs:  toPlayLengthMs,
  isSongSwap:    v => !!v,
  swapSongName:  v => v ?? null,
  swapArtist:    v => v ?? null,
  advancedBy:    v => v ?? null,
  tipCents:      v => (Number.isFinite(v) && v > 0 ? Math.round(v) : 0),
};

function buildUpdate(body) {
  const set = { updatedAt: new Date() };
  for (const [field, convert] of Object.entries(EDITABLE_FIELDS)) {
    if (field in body) set[field] = convert(body[field]);
  }
  return set;
}

export default async function handler(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const objId = toObjectId(req.query.id);
  if (!objId) return res.status(400).json({ error: 'Invalid id' });

  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const col = db.collection('dj_requests');

  const thisReq = await col.findOne({ _id: objId });
  if (!thisReq) return res.status(404).json({ error: 'Not found' });

  const sessionOid = toObjectId(thisReq.sessionId);
  const djSession = sessionOid ? await db.collection('dj_sessions').findOne({ _id: sessionOid }) : null;
  if (djSession) {
    const { state } = getSessionTimeState(djSession);
    if (state === 'grace' || state === 'expired') {
      return res.status(403).json({ error: 'Session expired', timeState: state });
    }
  }

  const authSession = await getServerSession(req, res, authOptions);
  const userId = authSession?.user?.id ?? null;
  const isOwner = !!userId && thisReq.ownerId === userId;

  if (req.method === 'DELETE') {
    if (isOwner) {
      await col.deleteOne({ _id: objId });
      return res.status(200).json({ ok: true });
    }
    // Attendees may withdraw their own request until it starts playing.
    // Signed-in attendees are identified by their user id, anonymous ones by clientId.
    const clientId = userId ?? req.query.clientId;
    if (!clientId || thisReq.clientId !== clientId) return res.status(403).json({ error: 'Forbidden' });
    const result = await col.deleteOne({ _id: objId, clientId, status: { $in: ATTENDEE_REMOVABLE_STATUSES } });
    if (!result.deletedCount) return res.status(409).json({ error: 'Request can no longer be withdrawn' });
    return res.status(200).json({ ok: true });
  }

  // PATCH — DJ only
  if (!isOwner) return res.status(userId ? 403 : 401).json({ error: 'Forbidden' });

  const body = req.body ?? {};
  await col.updateOne({ _id: objId }, { $set: buildUpdate(body) });

  if (body.status === 'played') {
    if (thisReq.danceType === 'partner') {
      // Partner group: mark all requests sharing the same groupId as played.
      // groupId is the _id of the original request; upvotes store it in partnerGroupId.
      const groupId = thisReq.partnerGroupId ?? String(thisReq._id);
      const groupOid = toObjectId(groupId);
      await col.updateMany(
        {
          sessionId: thisReq.sessionId,
          _id: { $ne: objId },
          status: { $in: ['pending', 'approved', 'skipped'] },
          $or: [
            ...(groupOid ? [{ _id: groupOid }] : []), // the original (when playing an upvote)
            { partnerGroupId: groupId },             // all upvotes
          ],
        },
        { $set: { status: 'played', updatedAt: new Date() } }
      );
    } else {
      await markSiblingsPlayed(col, objId, buildSiblingDanceMatch(thisReq), thisReq.sessionId);
    }
  }

  return res.status(200).json({ ok: true });
}
