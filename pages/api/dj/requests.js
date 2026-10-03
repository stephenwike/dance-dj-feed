import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { listRequests, createRequest, getActiveSession } from '../../../lib/server/dj/requestLogic';
import {
  isSessionOwner, sanitizeCreateBody, createBlockedReason, redactForViewer, withoutDjOnlyFields,
} from '../../../lib/server/dj/requestAccess';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import { getSessionTimeState } from '../../../lib/dj/sessionTimeState';
import { toObjectId } from '../../../lib/server/db';

// Only pending requests are hidden for suppressed requesters.
// Approved (queued) dances stay visible — the DJ approved the dance, not just
// the requester, and others may have requested it too.
const SUPPRESS_STATUSES = new Set(['pending']);

// Session settings an attendee's page needs to render (live, so the DJ's
// toggles take effect mid-event without a reload).
function publicSessionInfo(session) {
  return {
    status: session.status,
    requestsEnabled: session.requestsEnabled !== false,
    partnerDancesEnabled: session.partnerDancesEnabled !== false,
    tippingEnabled: session.tippingEnabled !== false,
  };
}

// Resolve the target session: an explicit sessionId, or — for a signed-in DJ
// only — their own active session.
async function resolveSession(db, client, sessionId, userId) {
  if (sessionId) {
    const oid = toObjectId(sessionId);
    return oid ? db.collection('dj_sessions').findOne({ _id: oid }) : null;
  }
  return getActiveSession(client, userId);
}

export default async function handler(req, res) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const authSession = await getServerSession(req, res, authOptions);
  const userId = authSession?.user?.id ?? null;

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const { sessionId, clientId } = req.query;

    const session = await resolveSession(db, client, sessionId, userId);
    if (!session) return res.status(200).json(clientId ? { requests: [], suppressed: false, directMessages: [] } : []);

    const requests = await listRequests(client, String(session._id));

    // The owner's controller/feed sees everything. A request carrying a
    // clientId comes from the attendee app (even if the DJ is testing it while
    // signed in), so it gets the attendee view.
    const isOwnerView = !clientId && isSessionOwner(session, userId);
    if (isOwnerView) return res.status(200).json(requests);

    const suppressedClientIds = session.suppressedClientIds ?? [];
    const visible = suppressedClientIds.length > 0
      ? requests.filter(r => !suppressedClientIds.includes(r.clientId) || !SUPPRESS_STATUSES.has(r.status))
      : requests;
    const redacted = redactForViewer(visible, clientId ?? null);

    if (!clientId) return res.status(200).json(redacted);

    // Attendee view: include their suppression status, live session settings,
    // and any active DMs addressed to their anonymous clientId.
    const now = new Date();
    const directMessages = await db.collection('dj_direct_messages').find({
      recipientClientId: clientId,
      status: 'active',
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).sort({ createdAt: -1 }).toArray();

    return res.status(200).json({
      requests: redacted,
      suppressed: suppressedClientIds.includes(clientId),
      session: publicSessionInfo(session),
      directMessages: directMessages.map(m => ({ ...m, _id: String(m._id) })),
    });
  }

  if (req.method === 'POST') {
    const session = await resolveSession(db, client, req.body?.sessionId, userId);
    const isOwner = isSessionOwner(session, userId);
    const body = sanitizeCreateBody(req.body, { isOwner });

    const blocked = createBlockedReason(session, body.clientId, { isOwner });
    if (blocked) return res.status(session ? 403 : 404).json({ error: blocked });

    const { state } = getSessionTimeState(session);
    if (state === 'grace' || state === 'expired') {
      return res.status(403).json({ error: 'Session expired', timeState: state });
    }

    try {
      const doc = await createRequest(client, session, body);
      // A duplicate request returns the existing one, which the DJ may already
      // have matched to a file — keep that private.
      return res.status(201).json(isOwner ? doc : withoutDjOnlyFields(doc));
    } catch (err) {
      return res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
