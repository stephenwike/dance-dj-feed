import Stripe from 'stripe';
import clientPromise from '../../../../lib/server/mongodb';
import { getAuth } from '@clerk/nextjs/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true') return res.status(503).json({ error: 'Payments not yet enabled' });

  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const profiles = client.db('bld').collection('dj_profiles');

  let profile = await profiles.findOne({ ownerId: userId });
  let stripeAccountId = profile?.stripeAccountId;

  // Create a new Express account if one doesn't exist yet
  if (!stripeAccountId) {
    const account = await stripe.accounts.create({ type: 'express' });
    stripeAccountId = account.id;
    await profiles.updateOne(
      { ownerId: userId },
      { $set: { ownerId: userId, stripeAccountId, createdAt: new Date(), updatedAt: new Date() } },
      { upsert: true }
    );
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL;
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${base}/dj-profile?connect_refresh=1`,
    return_url:  `${base}/dj-profile?connect_success=1`,
    type: 'account_onboarding',
  });

  return res.status(200).json({ url: accountLink.url });
}
