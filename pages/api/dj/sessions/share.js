import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/server/authOptions';
import clientPromise from '../../../../lib/server/mongodb';
import { enableSharing, disableSharing } from '../../../../lib/server/dj/shareLogic';

/**
 * Turn a session's share link on (POST → { token }) or off (DELETE).
 * Only the session's owner can. See lib/server/dj/shareLogic.js.
 */
export default async function handler(req, res) {
  const authSession = await getServerSession(req, res, authOptions);
  const userId = authSession?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { sessionId, timeZone } = req.body ?? {};
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
  const client = await clientPromise;

  if (req.method === 'POST') {
    const token = await enableSharing(client, userId, String(sessionId), timeZone);
    if (!token) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ token });
  }

  if (req.method === 'DELETE') {
    if (!(await disableSharing(client, userId, String(sessionId)))) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
