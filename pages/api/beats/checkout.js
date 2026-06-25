import Stripe from 'stripe';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import { BEAT_PACKAGES_BY_ID } from '../../../lib/beats/packages';
import { safeReturnUrl } from '../../../lib/server/safeReturnUrl';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true') return res.status(503).json({ error: 'Payments not yet enabled' });

  const authSession = await getServerSession(req, res, authOptions);
  const userId = authSession?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { packageId, returnUrl } = req.body ?? {};
  const pkg = BEAT_PACKAGES_BY_ID[packageId];
  if (!pkg) return res.status(400).json({ error: 'Invalid package' });

  const safeReturn = safeReturnUrl(returnUrl);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: pkg.priceCents,
        product_data: {
          name: `${pkg.beats} Beats`,
          description: `${pkg.base} base + ${pkg.bonus} bonus Beats`,
        },
      },
      quantity: 1,
    }],
    metadata: {
      attendeeId: userId,
      packageId: pkg.id,
      beats: String(pkg.beats),
    },
    success_url: `${safeReturn}?beats_success=1`,
    cancel_url: safeReturn,
  });

  return res.status(200).json({ url: session.url });
}
