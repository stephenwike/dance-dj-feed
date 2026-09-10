import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const col = client.db(DB_NAME).collection('dj_direct_messages');

  if (req.method === 'POST') {
    const { recipientId, text, duration } = req.body ?? {};
    if (!recipientId || !text?.trim()) return res.status(400).json({ error: 'recipientId and text are required' });

    const now = new Date();
    const expiresAt = duration ? new Date(now.getTime() + duration * 1000) : null;
    const doc = {
      senderId: userId,
      recipientId,
      text: text.trim(),
      status: 'active',
      createdAt: now,
      expiresAt,
    };
    const result = await col.insertOne(doc);
    return res.status(201).json({ message: { ...doc, _id: String(result.insertedId) } });
  }

  if (req.method === 'GET') {
    const now = new Date();
    const messages = await col.find({
      recipientId: userId,
      status: 'active',
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).sort({ createdAt: -1 }).toArray();
    return res.status(200).json({
      messages: messages.map(m => ({ ...m, _id: String(m._id) })),
    });
  }

  if (req.method === 'PATCH') {
    const { id } = req.body ?? {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    await col.updateOne(
      { _id: new ObjectId(id), recipientId: userId },
      { $set: { status: 'dismissed' } }
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
