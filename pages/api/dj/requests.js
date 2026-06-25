import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { listRequests, createRequest, getActiveSession } from '../../../lib/server/dj/requestLogic';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import { getSessionTimeState } from '../../../lib/server/dj/sessionTimeState';

export default async function handler(req, res) {
  const client = await clientPromise;

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const { sessionId } = req.query;
    const authSession = await getServerSession(req, res, authOptions);
    const userId = authSession?.user?.id ?? null;
    return res.status(200).json(await listRequests(client, sessionId ?? null, userId));
  }

  if (req.method === 'POST') {
    const targetSessionId = req.body?.sessionId;
    if (targetSessionId) {
      try {
        const { ObjectId } = require('mongodb');
        const djSession = await client.db(DB_NAME).collection('dj_sessions')
          .findOne({ _id: new ObjectId(targetSessionId) });
        if (djSession) {
          const { state } = getSessionTimeState(djSession);
          if (state === 'grace' || state === 'expired') {
            return res.status(403).json({ error: 'Session expired', timeState: state });
          }
        }
      } catch { /* invalid ObjectId, let createRequest handle it */ }
    }
    try {
      const doc = await createRequest(client, req.body);
      return res.status(201).json(doc);
    } catch (err) {
      return res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
