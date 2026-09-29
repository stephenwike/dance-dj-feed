import Stripe from 'stripe';
import { safeReturnUrl } from '../../../lib/server/safeReturnUrl';
import { stripeFeeCents } from '../../../lib/payments/fees';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const MIN_AMOUNT_CENTS = 100; // $1 minimum

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true') return res.status(503).json({ error: 'Payments not yet enabled' });

  const { djId, amountCents, returnUrl } = req.body ?? {};

  if (!djId) return res.status(400).json({ error: 'djId is required' });
  if (!Number.isInteger(amountCents) || amountCents < MIN_AMOUNT_CENTS) {
    return res.status(400).json({ error: `Minimum tip is $${MIN_AMOUNT_CENTS / 100}` });
  }

  const safeReturn = safeReturnUrl(returnUrl);

  const fee = stripeFeeCents(amountCents);
  const totalCents = amountCents + fee;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: totalCents,
        product_data: {
          name: 'DJ Tip',
          description: `Tip for the DJ ($${(amountCents / 100).toFixed(2)} + $${(fee / 100).toFixed(2)} processing)`,
        },
      },
      quantity: 1,
    }],
    metadata: {
      type: 'direct_tip',
      djId,
      amountCents: String(amountCents),
    },
    success_url: `${safeReturn}?tip_success=1`,
    cancel_url: safeReturn,
  });

  return res.status(200).json({ url: session.url });
}
