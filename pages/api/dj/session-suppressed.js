import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId, clientId } = req.query;
  if (!sessionId || !clientId) return res.status(400).json({ error: 'sessionId and clientId are required' });

  let oid;
  try { oid = new ObjectId(sessionId); } catch { return res.status(400).json({ error: 'Invalid sessionId' }); }

  const client = await clientPromise;
  const session = await client.db(DB_NAME).collection('dj_sessions').findOne(
    { _id: oid },
    { projection: { suppressedClientIds: 1 } }
  );

  if (!session) return res.status(404).json({ error: 'Session not found' });

  const suppressed = (session.suppressedClientIds ?? []).includes(clientId);
  return res.status(200).json({ suppressed });
}
