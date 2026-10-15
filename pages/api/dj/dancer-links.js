import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import clientPromise from '../../../lib/server/mongodb';
import { listLinkableSessions, previewDancers, linkDancers } from '../../../lib/server/dj/dancerLinks';
import { ensureHostDancerIndexes } from '../../../lib/server/ldco/hostDancers';

/**
 * "Link past dancers" (lib/server/dj/dancerLinks.js) — for the signed-in
 * host, their own past events only.
 *
 * GET                                        → { sessions: [{ id, name, date, dancers, guests, linked }] }
 * POST { action: 'preview', sessionIds }     → { dancers: [...], guests }
 * POST { action: 'link', sessionIds, userIds } → { dancers, newLinks, events }
 */
export default async function handler(req, res) {
  const authSession = await getServerSession(req, res, authOptions);
  const hostId = authSession?.user?.id ?? null;
  if (!hostId) return res.status(401).json({ error: 'Unauthorized' });
  const client = await clientPromise;

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ sessions: await listLinkableSessions(client, hostId) });
  }

  if (req.method === 'POST') {
    const { action, sessionIds, userIds } = req.body ?? {};
    if (!Array.isArray(sessionIds) || !sessionIds.length) return res.status(400).json({ error: 'Choose at least one event' });
    if (action === 'preview') {
      return res.status(200).json(await previewDancers(client, hostId, sessionIds));
    }
    if (action === 'link') {
      if (!Array.isArray(userIds) || !userIds.length) return res.status(400).json({ error: 'Choose at least one dancer' });
      await ensureHostDancerIndexes(client);
      return res.status(200).json(await linkDancers(client, hostId, { sessionIds, userIds }));
    }
    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
