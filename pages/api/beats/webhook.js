import Stripe from 'stripe';
import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { markWebhookReceived } from '../../../lib/server/stripeHealth';
import { createSession } from '../../../lib/server/dj/sessionLogic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Raw body required for Stripe signature verification — disable Next.js body parser.
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).end();
  }

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  markWebhookReceived();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const metadata = session.metadata ?? {};
    const client = await clientPromise;
    const db = client.db(DB_NAME);

    if (metadata.type === 'direct_tip') {
      const { djId, amountCents } = metadata;
      if (!djId || !amountCents) {
        console.error('Missing direct_tip metadata on session', session.id);
        return res.status(400).end();
      }
      await db.collection('dj_wallet_transactions').insertOne({
        ownerId: djId,
        type: 'direct_tip',
        amountCents: parseInt(amountCents, 10),
        attendeeId: null,
        stripeSessionId: session.id,
        createdAt: new Date(),
      });
      return res.status(200).json({ received: true });
    }

    if (metadata.type === 'session_extension') {
      const { sessionId, hours } = metadata;
      if (!sessionId || !hours) {
        console.error('Missing session_extension metadata on session', session.id);
        return res.status(400).end();
      }
      const { ObjectId } = require('mongodb');
      const djSession = await db.collection('dj_sessions').findOne({ _id: new ObjectId(sessionId) });
      if (!djSession) {
        console.error('Session not found for extension', sessionId);
        return res.status(400).end();
      }
      const currentEndsAt = new Date(djSession.endsAt).getTime();
      const newEndsAt = new Date(currentEndsAt + Number(hours) * 3600000);
      const update = {
        $set: { endsAt: newEndsAt },
        $push: { extensions: { hours: Number(hours), at: new Date(), stripeSessionId: session.id } },
      };
      if (djSession.status === 'closed') {
        update.$set.status = 'active';
        update.$set.closedAt = null;
      }
      await db.collection('dj_sessions').updateOne({ _id: new ObjectId(sessionId) }, update);
      return res.status(200).json({ received: true });
    }

    if (metadata.type === 'dj_session') {
      const { ownerId, name, plugin, durationMinutes } = metadata;
      if (!ownerId || !durationMinutes) {
        console.error('Missing dj_session metadata on checkout session', session.id);
        return res.status(400).end();
      }
      await createSession(client, {
        ownerId, name, plugin: plugin || 'standard', durationMinutes: Number(durationMinutes),
      });
      return res.status(200).json({ received: true });
    }

    // Beat purchase
    const { attendeeId, beats } = metadata;
    if (!attendeeId || !beats) {
      console.error('Missing metadata on checkout session', session.id);
      return res.status(400).end();
    }

    const beatCount = parseInt(beats, 10);

    await Promise.all([
      db.collection('beat_balances').updateOne(
        { attendeeId },
        { $inc: { beats: beatCount }, $set: { updatedAt: new Date() } },
        { upsert: true }
      ),
      db.collection('beat_transactions').insertOne({
        attendeeId,
        type: 'purchase',
        beats: beatCount,
        amountCents: session.amount_total,
        stripePaymentIntentId: session.payment_intent,
        stripeSessionId: session.id,
        createdAt: new Date(),
      }),
    ]);
  }

  return res.status(200).json({ received: true });
}

