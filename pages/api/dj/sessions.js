import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { getAuth } from '@clerk/nextjs/server';
import { createSession } from '../../../lib/server/dj/sessionLogic';

export default async function handler(req, res) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const col = client.db(DB_NAME).collection('dj_sessions');

  if (req.method === 'GET') {
    const sessions = await col.find({ ownerId: userId }).sort({ startedAt: -1 }).toArray();
    return res.status(200).json(sessions.map(s => ({ ...s, _id: String(s._id) })));
  }

  if (req.method === 'POST') {
    const doc = await createSession(client, {
      ownerId: userId,
      name: req.body?.name,
      plugin: req.body?.plugin,
      durationMinutes: req.body?.durationMinutes,
    });
    return res.status(201).json(doc);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

