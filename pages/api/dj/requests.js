import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { listRequests, createRequest, getActiveSession } from '../../../lib/server/dj/requestLogic';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import { getSessionTimeState } from '../../../lib/server/dj/sessionTimeState';
import { ObjectId } from 'mongodb';

// Statuses that are hidden for suppressed requesters.
// played/playing are kept so dances still show the REPEAT indicator when re-enabled.
const SUPPRESS_STATUSES = new Set(['pending', 'approved']);

export default async function handler(req, res) {
  const client = await clientPromise;

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const { sessionId, clientId } = req.query;
    const db = client.db(DB_NAME);

    const authSession = await getServerSession(req, res, authOptions);
    const userId = authSession?.user?.id ?? null;

    const requests = await listRequests(client, sessionId ?? null, null);

    // Fetch session for suppression data. Also grab ownerId so we can skip
    // filtering for the DJ's own controller view (they need to see everyone).
    let suppressedClientIds = [];
    let djSessionDoc = null;
    if (sessionId) {
      try {
        djSessionDoc = await db.collection('dj_sessions').findOne(
          { _id: new ObjectId(sessionId) },
          { projection: { suppressedClientIds: 1, ownerId: 1 } }
        );
        suppressedClientIds = djSessionDoc?.suppressedClientIds ?? [];
      } catch { /* invalid sessionId — leave suppressedClientIds empty */ }
    }

    // Only skip filtering for the DJ's controller view: authenticated owner with no clientId.
    // If clientId is present the request is from the requester app (even if the DJ is testing
    // it while logged in), so filtering still applies.
    const isOwner = !clientId && userId && djSessionDoc?.ownerId === userId;
    const filteredRequests = (!isOwner && suppressedClientIds.length > 0)
      ? requests.filter(r => !suppressedClientIds.includes(r.clientId) || !SUPPRESS_STATUSES.has(r.status))
      : requests;

    // When the requester is an anonymous attendee, also return suppression
    // status and any active DMs addressed to them.
    if (clientId && sessionId) {
      try {
        const now = new Date();
        const directMessages = await db.collection('dj_direct_messages').find({
          recipientClientId: clientId,
          status: 'active',
          $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
        }).sort({ createdAt: -1 }).toArray();

        const suppressed = suppressedClientIds.includes(clientId);
        return res.status(200).json({
          requests: filteredRequests,
          suppressed,
          directMessages: directMessages.map(m => ({ ...m, _id: String(m._id) })),
        });
      } catch { /* fall through to plain response */ }
    }

    return res.status(200).json(filteredRequests);
  }

  if (req.method === 'POST') {
    const targetSessionId = req.body?.sessionId;
    if (targetSessionId) {
      try {
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
