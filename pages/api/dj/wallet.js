import Stripe from 'stripe';
import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const col = client.db(DB_NAME).collection('dj_wallet_transactions');

  // Balance must sum ALL transactions — never limit this query
  const allTransactions = await col.find({ ownerId: userId }).toArray();
  const balance = allTransactions.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);

  // Only send the 50 most recent to the client for display
  const transactions = allTransactions
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);

  let stripeAvailable = 0;
  let stripePending = 0;
  try {
    const bal = await stripe.balance.retrieve();
    const usd = (arr) => (arr.find(b => b.currency === 'usd')?.amount ?? 0);
    stripeAvailable = usd(bal.available);
    stripePending = usd(bal.pending);
  } catch { /* non-fatal */ }

  return res.status(200).json({
    balance,
    stripeAvailable,
    stripePending,
    transactions: transactions.map(t => ({
      ...t,
      _id: String(t._id),
    })),
  });
}

