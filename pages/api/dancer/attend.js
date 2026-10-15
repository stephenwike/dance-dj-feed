import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { toObjectId } from '../../../lib/server/db';
import { recordAttendance, ensureHostDancerIndexes } from '../../../lib/server/ldco/hostDancers';

let indexesReady = null;

/**
 * POST { sessionId } — the signed-in dancer has this host's live event open
 * on the requester app: record that they dance with this host
 * (lib/server/ldco/hostDancers.js). Called once per page load.
 * → { recorded, firstVisit }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authSession = await getServerSession(req, res, authOptions);
  const userId = authSession?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Sign in first' });

  const objId = toObjectId(req.body?.sessionId);
  if (!objId) return res.status(400).json({ error: 'Invalid sessionId' });

  const client = await clientPromise;
  indexesReady ??= ensureHostDancerIndexes(client).catch(err => {
    indexesReady = null; // try again next time
    console.error('host_dancers indexes:', err.message);
  });
  await indexesReady;

  // Only live events count: opening an old link isn't being there.
  const session = await client.db(DB_NAME).collection('dj_sessions')
    .findOne({ _id: objId, status: 'active' }, { projection: { _id: 1, ownerId: 1 } });
  if (!session) return res.status(404).json({ error: 'No live event' });

  return res.status(200).json(await recordAttendance(client, { session, userId }));
}
