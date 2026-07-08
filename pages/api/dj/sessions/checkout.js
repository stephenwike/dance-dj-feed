import Stripe from 'stripe';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/server/authOptions';
import clientPromise from '../../../../lib/server/mongodb';
import { createSession, activateDraftSession } from '../../../../lib/server/dj/sessionLogic';
import { isFreeSessionEmail } from '../../../../lib/server/dj/sessionAccess';
import { safeReturnUrl } from '../../../../lib/server/safeReturnUrl';
import { SESSION_DURATIONS_BY_MINUTES, SESSION_PLUGINS } from '../../../../lib/dj/sessionPricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authSession = await getServerSession(req, res, authOptions);
  const userId = authSession?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { name, plugin, durationMinutes, returnUrl, draftSessionId } = req.body ?? {};

  const tier = SESSION_DURATIONS_BY_MINUTES[Number(durationMinutes)];
  if (!tier) return res.status(400).json({ error: 'Invalid duration' });

  const resolvedPlugin = plugin ?? 'standard';
  if (!SESSION_PLUGINS.includes(resolvedPlugin)) {
    return res.status(400).json({ error: 'Invalid plugin' });
  }

  const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';

  const client = await clientPromise;

  if (!paymentsEnabled) {
    const doc = draftSessionId
      ? await activateDraftSession(client, draftSessionId, { durationMinutes: tier.minutes })
      : await createSession(client, { ownerId: userId, name, plugin: resolvedPlugin, durationMinutes: tier.minutes });
    return res.status(201).json({ session: doc });
  }

  if (await isFreeSessionEmail(client, authSession.user.email)) {
    const doc = draftSessionId
      ? await activateDraftSession(client, draftSessionId, { durationMinutes: tier.minutes })
      : await createSession(client, { ownerId: userId, name, plugin: resolvedPlugin, durationMinutes: tier.minutes });
    return res.status(201).json({ session: doc });
  }

  // Stripe Checkout — the dj_sessions doc is created by the webhook on
  // checkout.session.completed
  const safeReturn = safeReturnUrl(returnUrl);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: tier.priceCents,
        product_data: {
          name: `DJ Session — ${tier.label}`,
          description: `Start a ${tier.label} DJ session`,
        },
      },
      quantity: 1,
    }],
    metadata: {
      type: 'dj_session',
      ownerId: userId,
      name: name || '',
      plugin: resolvedPlugin,
      durationMinutes: String(tier.minutes),
      draftSessionId: draftSessionId || '',
    },
    success_url: `${safeReturn}?session_started=1`,
    cancel_url: safeReturn,
  });

  return res.status(200).json({ url: session.url });
}
