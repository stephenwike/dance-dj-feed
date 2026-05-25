import clientPromise from '../../../lib/server/mongodb';
import { getAuth } from '@clerk/nextjs/server';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const transactions = await client.db('bld')
    .collection('dj_wallet_transactions')
    .find({ ownerId: userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  const balance = transactions.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);

  return res.status(200).json({
    balance,
    transactions: transactions.map(t => ({
      ...t,
      _id: String(t._id),
    })),
  });
}
