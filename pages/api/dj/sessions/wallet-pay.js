import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/server/authOptions';
import clientPromise, { DB_NAME } from '../../../../lib/server/mongodb';
import { createSession, activateDraftSession } from '../../../../lib/server/dj/sessionLogic';
import { resolveLaunch } from '../../../../lib/server/dj/launchRequest';
import { djPays } from '../../../../lib/server/dj/sessionAccess';
import { SESSION_DURATIONS_BY_MINUTES, SESSION_PLUGINS } from '../../../../lib/dj/sessionPricing';
import { getWalletBalance, withWalletLock } from '../../../../lib/server/wallet';

/**
 * POST — go live, paid from the DJ's wallet (at the wallet price: no Stripe
 * fee). Same body as /api/dj/sessions/checkout; returns { session }.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true') return res.status(503).json({ error: 'Payments not enabled' });

  const authSession = await getServerSession(req, res, authOptions);
  const userId = authSession?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const launch = await resolveLaunch(client, userId, req.body, {
    tiersByMinutes: SESSION_DURATIONS_BY_MINUTES, plugins: SESSION_PLUGINS,
  });
  if (launch.error) return res.status(launch.status).json({ error: launch.error });
  const { draft, name, tier, plugin, charge } = launch;
  const priceCents = charge.walletPriceCents;
  const start = () => (draft
    ? activateDraftSession(client, draft._id, { ownerId: userId, durationMinutes: tier.minutes, plugin })
    : createSession(client, { ownerId: userId, name, plugin, durationMinutes: tier.minutes }));

  // DJs on the free-access list aren't charged, whichever way they choose to pay.
  if (!(await djPays(client, authSession.user.email))) {
    return res.status(201).json({ session: await start() });
  }

  try {
    const result = await withWalletLock(db, userId, async () => {
      const balance = await getWalletBalance(db, userId);
      if (balance < priceCents) {
        return {
          status: 400,
          body: { error: `Insufficient wallet balance. Need $${(priceCents / 100).toFixed(2)}, have $${(balance / 100).toFixed(2)}.` },
        };
      }

      const doc = await start();

      await db.collection('dj_wallet_transactions').insertOne({
        ownerId: userId,
        type: 'session_payment',
        amountCents: -priceCents,
        sessionId: String(doc._id),
        durationMinutes: tier.minutes,
        addOns: doc.addOns ?? [],
        createdAt: new Date(),
        note: `${charge.items.map(i => i.label).join(' + ')} — paid from wallet`,
      });

      return { status: 201, body: { session: doc } };
    });
    return res.status(result.status).json(result.body);
  } catch (err) {
    return res.status(err.statusCode ?? 500).json({ error: err.message });
  }
}
