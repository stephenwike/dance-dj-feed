import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const transactions = await client.db(DB_NAME)
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

