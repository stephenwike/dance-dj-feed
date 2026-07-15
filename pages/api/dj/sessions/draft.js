import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/server/authOptions';
import clientPromise from '../../../../lib/server/mongodb';
import { createDraftSession } from '../../../../lib/server/dj/sessionLogic';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authSession = await getServerSession(req, res, authOptions);
  const userId = authSession?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  try {
    const doc = await createDraftSession(client, { ownerId: userId, name: req.body?.name, durationMinutes: req.body?.durationMinutes });
    return res.status(201).json({ session: doc });
  } catch (err) {
    return res.status(err.statusCode ?? 500).json({ error: err.message });
  }
}
