import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;

  const client = await clientPromise;
  const col = client.db(DB_NAME).collection('dj_direct_messages');

  // POST — DJ sends a DM (always requires DJ auth)
  if (req.method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { recipientId, recipientClientId, text, duration } = req.body ?? {};
    if ((!recipientId && !recipientClientId) || !text?.trim()) {
      return res.status(400).json({ error: 'recipientId or recipientClientId, and text are required' });
    }
    const now = new Date();
    const expiresAt = duration ? new Date(now.getTime() + duration * 1000) : null;
    const doc = {
      senderId: userId,
      ...(recipientId ? { recipientId } : { recipientClientId }),
      text: text.trim(),
      status: 'active',
      createdAt: now,
      expiresAt,
    };
    const result = await col.insertOne(doc);
    return res.status(201).json({ message: { ...doc, _id: String(result.insertedId) } });
  }

  // GET — fetch DMs for the current user (auth) or anonymous clientId via query param
  if (req.method === 'GET') {
    const { clientId } = req.query;
    const now = new Date();
    const activeFilter = { status: 'active', $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };

    if (userId) {
      const messages = await col.find({ recipientId: userId, ...activeFilter })
        .sort({ createdAt: -1 }).toArray();
      return res.status(200).json({ messages: messages.map(m => ({ ...m, _id: String(m._id) })) });
    }
    if (clientId) {
      const messages = await col.find({ recipientClientId: clientId, ...activeFilter })
        .sort({ createdAt: -1 }).toArray();
      return res.status(200).json({ messages: messages.map(m => ({ ...m, _id: String(m._id) })) });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // PATCH — dismiss a DM (auth user by userId, anonymous by matching clientId)
  if (req.method === 'PATCH') {
    const { id, clientId } = req.body ?? {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    let oid;
    try { oid = new ObjectId(id); } catch { return res.status(400).json({ error: 'Invalid id' }); }

    if (clientId) {
      // Anonymous dismiss — clientId in body takes priority so a residual auth session doesn't shadow it
      await col.updateOne({ _id: oid, recipientClientId: clientId }, { $set: { status: 'dismissed' } });
    } else if (userId) {
      await col.updateOne({ _id: oid, recipientId: userId }, { $set: { status: 'dismissed' } });
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
