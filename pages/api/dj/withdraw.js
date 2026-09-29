import Stripe from 'stripe';
import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import { getWalletBalance, withWalletLock } from '../../../lib/server/wallet';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const MIN_WITHDRAWAL = 100; // $1.00

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true') return res.status(503).json({ error: 'Payments not yet enabled' });

  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { amountCents } = req.body ?? {};
  if (!Number.isInteger(amountCents) || amountCents < MIN_WITHDRAWAL) {
    return res.status(400).json({ error: `Minimum withdrawal is $${MIN_WITHDRAWAL / 100}` });
  }

  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const ledger = db.collection('dj_wallet_transactions');

  // Verify Stripe account exists and payouts are enabled
  const profile = await db.collection('dj_profiles').findOne({ ownerId: userId });
  if (!profile?.stripeAccountId) {
    return res.status(400).json({ error: 'Payout account not set up' });
  }
  const account = await stripe.accounts.retrieve(profile.stripeAccountId);
  if (!account.payouts_enabled) {
    return res.status(400).json({ error: 'Payout account setup is incomplete' });
  }

  try {
    const result = await withWalletLock(db, userId, async () => {
      const balance = await getWalletBalance(db, userId);
      if (amountCents > balance) return { status: 400, body: { error: 'Insufficient balance' } };

      // Reserve the funds before moving money: if anything below crashes, the
      // ledger errs on the side of a debit without a transfer (recoverable by
      // hand) rather than a transfer without a debit.
      const { insertedId } = await ledger.insertOne({
        ownerId: userId,
        type: 'withdrawal',
        status: 'pending',
        amountCents: -amountCents,
        createdAt: new Date(),
      });

      let transfer;
      try {
        transfer = await stripe.transfers.create(
          { amount: amountCents, currency: 'usd', destination: profile.stripeAccountId },
          { idempotencyKey: `withdrawal_${insertedId}` },
        );
      } catch (err) {
        await ledger.deleteOne({ _id: insertedId });
        if (err.code === 'balance_insufficient') {
          return { status: 400, body: { error: 'Funds are still pending in Stripe. Payments typically take 2-3 business days to settle before they can be withdrawn.' } };
        }
        return { status: 500, body: { error: err.message || 'Transfer failed' } };
      }

      await ledger.updateOne(
        { _id: insertedId },
        { $set: { status: 'completed', stripeTransferId: transfer.id } },
      );
      return { status: 200, body: { ok: true, newBalance: balance - amountCents } };
    });
    return res.status(result.status).json(result.body);
  } catch (err) {
    return res.status(err.statusCode ?? 500).json({ error: err.message });
  }
}
