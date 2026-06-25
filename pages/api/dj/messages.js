import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';

async function getActiveSession(client, sessionId, ownerId) {
  const col = client.db(DB_NAME).collection('dj_sessions');
  if (sessionId) return col.findOne({ _id: require('mongodb').ObjectId.createFromHexString(sessionId) });
  const filter = { status: 'active' };
  if (ownerId) filter.ownerId = ownerId;
  return col.findOne(filter);
}

export default async function handler(req, res) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const col = db.collection('dj_messages');

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const { sessionId } = req.query;
    const session = await getActiveSession(client, sessionId, null);
    if (!session) return res.status(200).json({ message: null });

    const now = new Date();
    const message = await col.findOne({
      sessionId: String(session._id),
      status: 'active',
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    });

    return res.status(200).json({
      message: message
        ? { ...message, _id: String(message._id) }
        : null,
    });
  }

  if (req.method === 'POST') {
    const authSession = await getServerSession(req, res, authOptions);
    const userId = authSession?.user?.id ?? null;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { text, duration } = req.body ?? {};
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

    const session = await getActiveSession(client, null, userId);
    if (!session) return res.status(400).json({ error: 'No active session' });

    const sessionId = String(session._id);
    const now = new Date();
    const expiresAt = duration ? new Date(now.getTime() + duration * 1000) : null;

    // Dismiss any existing active message for this session
    await col.updateMany(
      { sessionId, status: 'active' },
      { $set: { status: 'dismissed', updatedAt: now } }
    );

    const doc = {
      sessionId,
      ownerId: userId,
      text: text.trim(),
      status: 'active',
      duration: duration ?? null,
      createdAt: now,
      expiresAt,
    };
    const result = await col.insertOne(doc);
    return res.status(201).json({ message: { ...doc, _id: String(result.insertedId) } });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

