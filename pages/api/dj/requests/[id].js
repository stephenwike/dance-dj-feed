import clientPromise, { DB_NAME } from '../../../../lib/server/mongodb';
import { ObjectId } from 'mongodb';
import { markSiblingsPlayed, buildSiblingDanceMatch } from '../../../../lib/server/dj/requestLogic';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/server/authOptions';

export default async function handler(req, res) {
  const client = await clientPromise;
  const col = client.db(DB_NAME).collection('dj_requests');
  const { id } = req.query;

  let objId;
  try { objId = new ObjectId(id); } catch {
    return res.status(400).json({ error: 'Invalid id' });
  }

  if (req.method === 'PATCH') {
    const body = req.body ?? {};
    const { status, queuePosition, playStartedAt, pausedAt,
            danceType, partnerStyle, danceName, danceId, songName, artist,
            difficulty, stepsheet, duration_ms, spotifyUri,
            isSongSwap, swapSongName, swapArtist, advancedBy, tipCents } = body;

    const thisReq = status === 'played' ? await col.findOne({ _id: objId }) : null;

    const set = { updatedAt: new Date() };
    if (status !== undefined) set.status = status;
    if (queuePosition !== undefined) set.queuePosition = queuePosition;
    if (playStartedAt !== undefined) set.playStartedAt = new Date(playStartedAt);
    if ('pausedAt' in body) set.pausedAt = pausedAt ? new Date(pausedAt) : null;
    if (danceType !== undefined) set.danceType = danceType;
    if (partnerStyle !== undefined) set.partnerStyle = partnerStyle;
    if (danceName !== undefined) set.danceName = danceName;
    if ('danceId' in body) set.danceId = danceId ?? null;
    if (songName !== undefined) set.songName = songName;
    if (artist !== undefined) set.artist = artist;
    if (difficulty !== undefined) set.difficulty = difficulty;
    if (stepsheet !== undefined) set.stepsheet = stepsheet;
    if (duration_ms !== undefined) set.duration_ms = duration_ms ?? null;
    if ('spotifyUri' in body) set.spotifyUri = spotifyUri ?? null;
    if ('isSongSwap' in body) set.isSongSwap = !!isSongSwap;
    if ('swapSongName' in body) set.swapSongName = swapSongName ?? null;
    if ('swapArtist' in body) set.swapArtist = swapArtist ?? null;
    if ('advancedBy' in body) set.advancedBy = advancedBy ?? null;
    if ('tipCents' in body) set.tipCents = Number.isFinite(tipCents) && tipCents > 0 ? Math.round(tipCents) : 0;

    const authSession = await getServerSession(req, res, authOptions);
    const userId = authSession?.user?.id ?? null;
    const filter = userId ? { _id: objId, ownerId: userId } : { _id: objId };
    await col.updateOne(filter, { $set: set });

    if (status === 'played' && thisReq) {
      await markSiblingsPlayed(col, objId, buildSiblingDanceMatch(thisReq), thisReq.sessionId);
    }

    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const delSession = await getServerSession(req, res, authOptions);
    const delUserId = delSession?.user?.id ?? null;
    const filter = delUserId ? { _id: objId, ownerId: delUserId } : { _id: objId };
    await col.deleteOne(filter);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
