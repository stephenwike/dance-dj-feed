import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import { getActiveSession } from '../../../lib/server/dj/requestLogic';
import { toObjectId } from '../../../lib/server/db';

// An explicit session by id (optionally restricted to an owner), or the
// signed-in owner's active session. Never an arbitrary DJ's session.
async function findSession(client, sessionId, ownerId) {
  if (sessionId) {
    const oid = toObjectId(sessionId);
    if (!oid) return null;
    const filter = ownerId ? { _id: oid, ownerId } : { _id: oid };
    return client.db(DB_NAME).collection('dj_sessions').findOne(filter);
  }
  return getActiveSession(client, ownerId);
}

export default async function handler(req, res) {
  const client = await clientPromise;
  const col = client.db(DB_NAME).collection('dj_messages');

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const { sessionId, audience } = req.query;
    // Without a sessionId, fall back to the signed-in DJ's active session.
    let ownerId = null;
    if (!sessionId) {
      const authSession = await getServerSession(req, res, authOptions);
      ownerId = authSession?.user?.id ?? null;
    }
    const session = await findSession(client, sessionId, ownerId);
    if (!session) return res.status(200).json({ message: null });

    const now = new Date();
    const filter = {
      sessionId: String(session._id),
      status: 'active',
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    };
    // Attendee-facing poll: only return broadcast messages
    if (audience === 'attendees') filter.sendToAll = true;

    const message = await col.findOne(filter);

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

    const { text, duration, sendToAll, sessionId: bodySessionId } = req.body ?? {};
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

    const session = await findSession(client, bodySessionId, userId);
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
      sendToAll: !!sendToAll,
      duration: duration ?? null,
      createdAt: now,
      expiresAt,
    };
    const result = await col.insertOne(doc);
    return res.status(201).json({ message: { ...doc, _id: String(result.insertedId) } });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
