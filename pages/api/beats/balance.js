import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { getAuth } from '@clerk/nextjs/server';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const doc = await client.db(DB_NAME).collection('beat_balances').findOne({ attendeeId: userId });

  return res.status(200).json({ beats: doc?.beats ?? 0 });
}

