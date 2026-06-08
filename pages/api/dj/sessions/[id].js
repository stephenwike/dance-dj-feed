import clientPromise, { DB_NAME } from '../../../../lib/server/mongodb';
import { ObjectId } from 'mongodb';
import { getAuth } from '@clerk/nextjs/server';

export default async function handler(req, res) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const col = client.db(DB_NAME).collection('dj_sessions');
  const { id } = req.query;

  let objId;
  try { objId = new ObjectId(id); } catch { return res.status(400).json({ error: 'Invalid id' }); }

  // GET — return session + played tracks for the report
  if (req.method === 'GET') {
    const session = await col.findOne({ _id: objId });
    if (!session) return res.status(404).json({ error: 'Not found' });
    const played = await client.db(DB_NAME).collection('dj_requests')
      .find({ sessionId: String(objId), status: 'played' })
      .sort({ updatedAt: 1 })
      .toArray();
    return res.status(200).json({ ...session, _id: String(session._id), played: played.map(r => ({ ...r, _id: String(r._id) })) });
  }

  if (req.method === 'PATCH') {
    const { status, partnerDancesEnabled, weightDecayEnabled, weightDecayHalfLifeMinutes } = req.body ?? {};
    const set = {};

    if (status === 'closed') {
      set.status = 'closed';
      set.closedAt = new Date();
    } else if (status === 'active') {
      await col.updateMany(
        { status: 'active', ownerId: userId, _id: { $ne: objId } },
        { $set: { status: 'closed', closedAt: new Date() } }
      );
      set.status = 'active';
      set.closedAt = null;
    }

    if (partnerDancesEnabled !== undefined) set.partnerDancesEnabled = partnerDancesEnabled;
    if (weightDecayEnabled !== undefined) set.weightDecayEnabled = !!weightDecayEnabled;
    if (weightDecayHalfLifeMinutes !== undefined) set.weightDecayHalfLifeMinutes = Number(weightDecayHalfLifeMinutes) || 60;
    await col.updateOne({ _id: objId, ownerId: userId }, { $set: set });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
