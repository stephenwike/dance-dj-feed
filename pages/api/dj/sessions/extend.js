import Stripe from 'stripe';
import { ObjectId } from 'mongodb';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/server/authOptions';
import clientPromise, { DB_NAME } from '../../../../lib/server/mongodb';
import { isFreeSessionEmail } from '../../../../lib/server/dj/sessionAccess';
import { getSessionTimeState } from '../../../../lib/server/dj/sessionTimeState';
import { EXTENSION_PRICE_CENTS_PER_HOUR } from '../../../../lib/dj/sessionPricing';
import { safeReturnUrl } from '../../../../lib/server/safeReturnUrl';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authSession = await getServerSession(req, res, authOptions);
  const userId = authSession?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { sessionId, hours } = req.body ?? {};
  const h = Number(hours);
  if (!sessionId || !h || h < 1 || h > 12) {
    return res.status(400).json({ error: 'Invalid sessionId or hours (1-12)' });
  }

  const client = await clientPromise;
  const col = client.db(DB_NAME).collection('dj_sessions');

  let objId;
  try { objId = new ObjectId(sessionId); } catch {
    return res.status(400).json({ error: 'Invalid sessionId' });
  }

  const djSession = await col.findOne({ _id: objId, ownerId: userId });
  if (!djSession) return res.status(404).json({ error: 'Session not found' });

  const { state } = getSessionTimeState(djSession);
  if (state === 'expired') {
    return res.status(403).json({ error: 'Session has expired and cannot be extended' });
  }

  let skipPayment = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true';
  if (!skipPayment) {
    skipPayment = await isFreeSessionEmail(client, authSession.user.email);
  }

  if (skipPayment) {
    const currentEndsAt = new Date(djSession.endsAt).getTime();
    const newEndsAt = new Date(currentEndsAt + h * 3600000);
    await col.updateOne(
      { _id: objId },
      {
        $set: { endsAt: newEndsAt },
        $push: { extensions: { hours: h, at: new Date(), free: true } },
      },
    );
    return res.status(200).json({ extended: true, newEndsAt });
  }

  const priceCents = h * EXTENSION_PRICE_CENTS_PER_HOUR;
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: priceCents,
        product_data: {
          name: `Session Extension — ${h} hr${h > 1 ? 's' : ''}`,
          description: `Extend your DJ session by ${h} hour${h > 1 ? 's' : ''}`,
        },
      },
      quantity: 1,
    }],
    metadata: {
      type: 'session_extension',
      sessionId: String(objId),
      hours: String(h),
      ownerId: userId,
    },
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dj-controller?extension_success=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dj-controller`,
  });

  return res.status(200).json({ url: checkoutSession.url });
}
