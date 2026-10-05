import Stripe from 'stripe';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/server/authOptions';
import clientPromise from '../../../../lib/server/mongodb';
import { createSession, activateDraftSession } from '../../../../lib/server/dj/sessionLogic';
import { djPays } from '../../../../lib/server/dj/sessionAccess';
import { resolveLaunch } from '../../../../lib/server/dj/launchRequest';
import { safeReturnUrl } from '../../../../lib/server/safeReturnUrl';
import { SESSION_DURATIONS_BY_MINUTES, SESSION_PLUGINS } from '../../../../lib/dj/sessionPricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * POST — go live: a new session ({ name, durationMinutes, plugin }) or a
 * saved draft ({ draftSessionId }), paid by card. Free for DJs who aren't
 * charged (payments off, or on the free-access list): returns { session }.
 * Otherwise returns { url } for Stripe Checkout; the webhook creates or
 * activates the session, and Stripe returns to `returnUrl` with
 * ?session_started=1 (or to `cancelUrl`).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authSession = await getServerSession(req, res, authOptions);
  const userId = authSession?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const launch = await resolveLaunch(client, userId, req.body, {
    tiersByMinutes: SESSION_DURATIONS_BY_MINUTES, plugins: SESSION_PLUGINS,
  });
  if (launch.error) return res.status(launch.status).json({ error: launch.error });
  const { draft, name, tier, plugin, charge } = launch;

  if (!(await djPays(client, authSession.user.email))) {
    const doc = draft
      ? await activateDraftSession(client, draft._id, { ownerId: userId, durationMinutes: tier.minutes, plugin })
      : await createSession(client, { ownerId: userId, name, plugin, durationMinutes: tier.minutes });
    return res.status(201).json({ session: doc });
  }

  const { returnUrl, cancelUrl } = req.body ?? {};
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: charge.items.map(item => ({
      price_data: { currency: 'usd', unit_amount: item.priceCents, product_data: { name: item.label } },
      quantity: 1,
    })),
    metadata: {
      type: 'dj_session',
      ownerId: userId,
      name,
      plugin,
      durationMinutes: String(tier.minutes),
      draftSessionId: draft ? String(draft._id) : '',
    },
    success_url: `${safeReturnUrl(returnUrl, req)}?session_started=1`,
    cancel_url: safeReturnUrl(cancelUrl ?? returnUrl, req),
  });

  return res.status(200).json({ url: checkoutSession.url });
}
