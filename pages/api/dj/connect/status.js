import Stripe from 'stripe';
import clientPromise, { DB_NAME } from '../../../../lib/server/mongodb';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/server/authOptions';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const profile = await client.db(DB_NAME).collection('dj_profiles').findOne({ ownerId: userId });

  if (!profile?.stripeAccountId) {
    return res.status(200).json({ connected: false, payoutsEnabled: false });
  }

  const account = await stripe.accounts.retrieve(profile.stripeAccountId);
  return res.status(200).json({
    connected: true,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  });
}

