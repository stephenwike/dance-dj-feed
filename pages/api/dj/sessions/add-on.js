import Stripe from 'stripe';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/server/authOptions';
import clientPromise, { DB_NAME } from '../../../../lib/server/mongodb';
import { addSessionAddOn } from '../../../../lib/server/dj/sessionLogic';
import { djPays } from '../../../../lib/server/dj/sessionAccess';
import { addOnFor, sessionHasPlugin } from '../../../../lib/dj/sessionAddOns';
import { isAvailable } from '../../../../lib/dj/musicSources';
import { safeReturnUrl } from '../../../../lib/server/safeReturnUrl';
import { toObjectId } from '../../../../lib/server/db';
import { getWalletBalance, withWalletLock } from '../../../../lib/server/wallet';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * POST { sessionId, plugin, payFromWallet?, returnUrl? } — buy a paid music
 * source for a running session and switch to it. Flat fee per session (see
 * lib/dj/sessionAddOns.js).
 *
 * Returns { session } once added (already owned, free for this DJ, or paid
 * from the wallet), or { url } for Stripe Checkout; the webhook then adds it
 * and Stripe returns to `returnUrl` with ?addon_success=1.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authSession = await getServerSession(req, res, authOptions);
  const userId = authSession?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { sessionId, plugin, payFromWallet, returnUrl } = req.body ?? {};
  const addOn = addOnFor(plugin);
  if (!addOn) return res.status(400).json({ error: 'That music source is included — no add-on needed' });
  if (!isAvailable(plugin)) return res.status(400).json({ error: `${addOn.label} is coming soon` });
  const objId = toObjectId(sessionId);
  if (!objId) return res.status(400).json({ error: 'Invalid sessionId' });

  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const djSession = await db.collection('dj_sessions').findOne({ _id: objId, ownerId: userId, status: 'active' });
  if (!djSession) return res.status(404).json({ error: 'Live session not found' });

  const add = () => addSessionAddOn(client, objId, { ownerId: userId, plugin });

  if (sessionHasPlugin(djSession, plugin) || !(await djPays(client, authSession.user.email))) {
    return res.status(200).json({ session: await add() });
  }

  if (payFromWallet) {
    try {
      const result = await withWalletLock(db, userId, async () => {
        const balance = await getWalletBalance(db, userId);
        if (balance < addOn.walletPriceCents) {
          return {
            status: 400,
            body: { error: `Insufficient wallet balance. Need $${(addOn.walletPriceCents / 100).toFixed(2)}, have $${(balance / 100).toFixed(2)}.` },
          };
        }
        const session = await add();
        await db.collection('dj_wallet_transactions').insertOne({
          ownerId: userId,
          type: 'session_payment',
          amountCents: -addOn.walletPriceCents,
          sessionId: String(objId),
          addOns: [plugin],
          createdAt: new Date(),
          note: `${addOn.label} add-on — paid from wallet`,
        });
        return { status: 200, body: { session } };
      });
      return res.status(result.status).json(result.body);
    } catch (err) {
      return res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  }

  const back = safeReturnUrl(returnUrl, req);
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: { currency: 'usd', unit_amount: addOn.priceCents, product_data: { name: `${addOn.label} add-on — ${djSession.name}` } },
      quantity: 1,
    }],
    metadata: { type: 'session_add_on', ownerId: userId, sessionId: String(objId), plugin },
    success_url: `${back}?addon_success=1`,
    cancel_url: back,
  });
  return res.status(200).json({ url: checkoutSession.url });
}
