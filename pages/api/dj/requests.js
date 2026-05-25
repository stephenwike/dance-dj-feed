import clientPromise from '../../../lib/server/mongodb';
import { listRequests, createRequest } from '../../../lib/server/dj/requestLogic';
import { getAuth } from '@clerk/nextjs/server';

export default async function handler(req, res) {
  const client = await clientPromise;

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const { sessionId } = req.query;
    const { userId } = getAuth(req);
    return res.status(200).json(await listRequests(client, sessionId ?? null, userId ?? null));
  }

  if (req.method === 'POST') {
    try {
      const doc = await createRequest(client, req.body);
      return res.status(201).json(doc);
    } catch (err) {
      return res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
