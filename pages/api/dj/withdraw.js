import Stripe from 'stripe';
import clientPromise from '../../../lib/server/mongodb';
import { getAuth } from '@clerk/nextjs/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const MIN_WITHDRAWAL = 100; // $1.00

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true') return res.status(503).json({ error: 'Payments not yet enabled' });

  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { amountCents } = req.body ?? {};
  if (!Number.isInteger(amountCents) || amountCents < MIN_WITHDRAWAL) {
    return res.status(400).json({ error: `Minimum withdrawal is $${MIN_WITHDRAWAL / 100}` });
  }

  const client = await clientPromise;
  const db = client.db('bld');

  // Verify Stripe account exists and payouts are enabled
  const profile = await db.collection('dj_profiles').findOne({ ownerId: userId });
  if (!profile?.stripeAccountId) {
    return res.status(400).json({ error: 'Payout account not set up' });
  }
  const account = await stripe.accounts.retrieve(profile.stripeAccountId);
  if (!account.payouts_enabled) {
    return res.status(400).json({ error: 'Payout account setup is incomplete' });
  }

  // Verify sufficient balance
  const transactions = await db.collection('dj_wallet_transactions')
    .find({ ownerId: userId })
    .toArray();
  const balance = transactions.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);
  if (amountCents > balance) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  // Transfer to DJ's connected account
  const transfer = await stripe.transfers.create({
    amount: amountCents,
    currency: 'usd',
    destination: profile.stripeAccountId,
  });

  // Record the debit
  await db.collection('dj_wallet_transactions').insertOne({
    ownerId: userId,
    type: 'withdrawal',
    amountCents: -amountCents,
    stripeTransferId: transfer.id,
    createdAt: new Date(),
  });

  return res.status(200).json({ ok: true, newBalance: balance - amountCents });
}
