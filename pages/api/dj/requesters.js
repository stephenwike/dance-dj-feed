import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  // GET — list requester stats for a session
  if (req.method === 'GET') {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    const djSession = await db.collection('dj_sessions').findOne(
      { _id: new ObjectId(sessionId), ownerId: userId },
      { projection: { suppressedClientIds: 1 } }
    );
    if (!djSession) return res.status(404).json({ error: 'Session not found' });

    const suppressedClientIds = djSession.suppressedClientIds ?? [];

    const requests = await db.collection('dj_requests')
      .find(
        { sessionId, status: { $in: ['pending', 'approved', 'playing'] } },
        { projection: { clientId: 1, requesterName: 1, status: 1 } }
      )
      .toArray();

    const requesterMap = {};
    for (const r of requests) {
      const cid = r.clientId;
      if (!cid) continue;
      if (!requesterMap[cid]) {
        requesterMap[cid] = {
          clientId: cid,
          displayName: r.requesterName || cid,
          requestCount: 0,
          beatsSpent: 0,
          isRegistered: false,
          email: null,
          suppressed: suppressedClientIds.includes(cid),
        };
      }
      requesterMap[cid].requestCount++;
    }

    const clientIds = Object.keys(requesterMap);

    if (clientIds.length > 0) {
      // All-time beats this user has tipped to this DJ
      const beatTips = await db.collection('beat_transactions')
        .find(
          { djId: userId, type: 'tip', attendeeId: { $in: clientIds } },
          { projection: { attendeeId: 1, beats: 1 } }
        )
        .toArray();
      for (const t of beatTips) {
        if (requesterMap[t.attendeeId]) {
          requesterMap[t.attendeeId].beatsSpent += Math.abs(t.beats ?? 0);
        }
      }

      // Direct tips to this DJ (by email → profile lookup)
      const profiles = await db.collection('user_profiles')
        .find({ id: { $in: clientIds } }, { projection: { id: 1, name: 1, email: 1 } })
        .toArray();

      const registeredEmails = profiles.map(p => p.email?.toLowerCase()).filter(Boolean);
      let directTipTotals = {};
      if (registeredEmails.length > 0) {
        const tips = await db.collection('dj_wallet_transactions')
          .find(
            { ownerId: userId, type: 'direct_tip', senderEmail: { $in: registeredEmails } },
            { projection: { senderEmail: 1, amountCents: 1 } }
          )
          .toArray();
        for (const t of tips) {
          const email = t.senderEmail?.toLowerCase();
          directTipTotals[email] = (directTipTotals[email] ?? 0) + (t.amountCents ?? 0);
        }
      }

      for (const p of profiles) {
        if (requesterMap[p.id]) {
          requesterMap[p.id].isRegistered = true;
          requesterMap[p.id].displayName = p.name || requesterMap[p.id].displayName;
          requesterMap[p.id].email = p.email ?? null;
          requesterMap[p.id].directTipCents = directTipTotals[p.email?.toLowerCase()] ?? 0;
        }
      }

      // DJ-assigned nicknames (persisted across sessions)
      const nicknameDocs = await db.collection('dj_requester_nicknames')
        .find({ djId: userId, clientId: { $in: clientIds } }, { projection: { clientId: 1, nickname: 1 } })
        .toArray();
      for (const n of nicknameDocs) {
        if (requesterMap[n.clientId]) requesterMap[n.clientId].nickname = n.nickname;
      }
    }

    const requesters = Object.values(requesterMap)
      .sort((a, b) => b.requestCount - a.requestCount);

    return res.status(200).json({ requesters, suppressedClientIds });
  }

  // POST — suppress or unsuppress a requester
  if (req.method === 'POST') {
    const { sessionId, clientId, suppress } = req.body ?? {};
    if (!sessionId || !clientId) return res.status(400).json({ error: 'sessionId and clientId are required' });

    const update = suppress
      ? { $addToSet: { suppressedClientIds: clientId } }
      : { $pull: { suppressedClientIds: clientId } };

    await db.collection('dj_sessions').updateOne(
      { _id: new ObjectId(sessionId), ownerId: userId },
      update
    );
    return res.status(200).json({ ok: true });
  }

  // PUT — set or clear a DJ-assigned nickname for a requester
  if (req.method === 'PUT') {
    const { clientId, nickname } = req.body ?? {};
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });
    const trimmed = (nickname ?? '').trim();
    if (trimmed) {
      await db.collection('dj_requester_nicknames').updateOne(
        { djId: userId, clientId },
        { $set: { nickname: trimmed, updatedAt: new Date() } },
        { upsert: true }
      );
    } else {
      await db.collection('dj_requester_nicknames').deleteOne({ djId: userId, clientId });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
