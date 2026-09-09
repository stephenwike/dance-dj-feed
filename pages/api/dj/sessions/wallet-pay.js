import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/server/authOptions';
import clientPromise, { DB_NAME } from '../../../../lib/server/mongodb';
import { createSession, activateDraftSession } from '../../../../lib/server/dj/sessionLogic';
import { SESSION_DURATIONS_BY_MINUTES, SESSION_PLUGINS } from '../../../../lib/dj/sessionPricing';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true') return res.status(503).json({ error: 'Payments not enabled' });

  const authSession = await getServerSession(req, res, authOptions);
  const userId = authSession?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { name, plugin, draftSessionId } = req.body ?? {};
  let { durationMinutes } = req.body ?? {};

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  // If activating a draft, fall back to its configured duration
  if (!durationMinutes && draftSessionId) {
    const { ObjectId } = require('mongodb');
    try {
      const draft = await db.collection('dj_sessions').findOne({ _id: new ObjectId(String(draftSessionId)) });
      if (draft?.durationMinutes) durationMinutes = draft.durationMinutes;
    } catch { /* bad id — fails at tier check below */ }
  }

  const tier = SESSION_DURATIONS_BY_MINUTES[Number(durationMinutes)];
  if (!tier) return res.status(400).json({ error: 'Invalid duration' });

  const resolvedPlugin = plugin ?? 'standard';
  if (!SESSION_PLUGINS.includes(resolvedPlugin)) return res.status(400).json({ error: 'Invalid plugin' });

  // Verify DJ has sufficient wallet balance
  const txns = await db.collection('dj_wallet_transactions').find({ ownerId: userId }).toArray();
  const balance = txns.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);

  if (balance < tier.walletPriceCents) {
    return res.status(400).json({
      error: `Insufficient wallet balance. Need $${(tier.walletPriceCents / 100).toFixed(2)}, have $${(balance / 100).toFixed(2)}.`,
    });
  }

  // Create or activate session
  const doc = draftSessionId
    ? await activateDraftSession(client, draftSessionId, { durationMinutes: tier.minutes })
    : await createSession(client, { ownerId: userId, name, plugin: resolvedPlugin, durationMinutes: tier.minutes });

  // Debit wallet
  await db.collection('dj_wallet_transactions').insertOne({
    ownerId: userId,
    type: 'session_payment',
    amountCents: -tier.walletPriceCents,
    sessionId: String(doc._id),
    durationMinutes: tier.minutes,
    createdAt: new Date(),
    note: `${tier.label} session — paid from wallet`,
  });

  return res.status(201).json({ session: doc });
}
