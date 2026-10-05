import Stripe from 'stripe';
import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { markWebhookReceived } from '../../../lib/server/stripeHealth';
import { claimStripeEvent, releaseStripeEvent } from '../../../lib/server/stripeEvents';
import { createSession, activateDraftSession, addSessionAddOn } from '../../../lib/server/dj/sessionLogic';
import { toObjectId } from '../../../lib/server/db';

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

// Malformed metadata is our bug, not a transient failure: log it and
// acknowledge, since a Stripe retry would fail the same way.
function badMetadata(what, checkoutSession) {
  console.error(`Missing ${what} metadata on checkout session`, checkoutSession.id);
}

async function handleDirectTip(db, checkoutSession) {
  const { djId, amountCents } = checkoutSession.metadata;
  if (!djId || !amountCents) return badMetadata('direct_tip', checkoutSession);

  const stripeName = checkoutSession.customer_details?.name ?? null;
  const senderEmail = checkoutSession.customer_details?.email ?? checkoutSession.customer_email ?? null;
  const tipAmountCents = parseInt(amountCents, 10);

  // Prefer the registered profile name over whatever Stripe captured at checkout
  const profile = senderEmail
    ? await db.collection('user_profiles').findOne({ email: senderEmail.toLowerCase() }, { projection: { name: 1 } })
    : null;
  const senderName = profile?.name || stripeName;
  const now = new Date();

  await Promise.all([
    db.collection('dj_wallet_transactions').insertOne({
      ownerId: djId,
      type: 'direct_tip',
      amountCents: tipAmountCents,
      attendeeId: null,
      stripeSessionId: checkoutSession.id,
      senderName,
      senderEmail,
      createdAt: now,
    }),
    db.collection('dj_notifications').insertOne({
      ownerId: djId,
      type: 'direct_tip',
      amountCents: tipAmountCents,
      senderName,
      senderEmail,
      read: false,
      createdAt: now,
    }),
  ]);
}

async function handleSessionExtension(db, checkoutSession) {
  const { sessionId, hours } = checkoutSession.metadata;
  const objId = toObjectId(sessionId);
  if (!objId || !hours) return badMetadata('session_extension', checkoutSession);

  const djSession = await db.collection('dj_sessions').findOne({ _id: objId });
  if (!djSession) return console.error('Session not found for extension', sessionId);

  const newEndsAt = new Date(new Date(djSession.endsAt).getTime() + Number(hours) * 3600000);
  const update = {
    $set: { endsAt: newEndsAt },
    $push: { extensions: { hours: Number(hours), at: new Date(), stripeSessionId: checkoutSession.id } },
  };
  if (djSession.status === 'closed') {
    update.$set.status = 'active';
    update.$set.closedAt = null;
  }
  await db.collection('dj_sessions').updateOne({ _id: objId }, update);
}

async function handleSessionPurchase(client, db, checkoutSession) {
  const { ownerId, name, plugin, durationMinutes, draftSessionId } = checkoutSession.metadata;
  if (!ownerId || !durationMinutes) return badMetadata('dj_session', checkoutSession);

  const sessionDoc = draftSessionId
    ? await activateDraftSession(client, draftSessionId, { ownerId, durationMinutes: Number(durationMinutes), plugin: plugin || undefined })
    : await createSession(client, {
        ownerId, name, plugin: plugin || 'standard', durationMinutes: Number(durationMinutes),
      });
  await db.collection('session_transactions').insertOne({
    ownerId,
    type: 'session_purchase',
    sessionId: String(sessionDoc._id),
    sessionName: sessionDoc.name ?? name ?? null,
    durationMinutes: Number(durationMinutes),
    addOns: sessionDoc.addOns ?? [],
    amountCents: checkoutSession.amount_total,
    stripeSessionId: checkoutSession.id,
    stripePaymentIntentId: checkoutSession.payment_intent ?? null,
    createdAt: new Date(),
  });
}

async function handleSessionAddOn(client, db, checkoutSession) {
  const { ownerId, sessionId, plugin } = checkoutSession.metadata;
  if (!ownerId || !sessionId || !plugin) return badMetadata('session_add_on', checkoutSession);

  const sessionDoc = await addSessionAddOn(client, sessionId, { ownerId, plugin });
  await db.collection('session_transactions').insertOne({
    ownerId,
    type: 'session_add_on',
    sessionId,
    sessionName: sessionDoc?.name ?? null,
    addOns: [plugin],
    amountCents: checkoutSession.amount_total,
    stripeSessionId: checkoutSession.id,
    stripePaymentIntentId: checkoutSession.payment_intent ?? null,
    createdAt: new Date(),
  });
}

async function handleBeatPurchase(db, checkoutSession) {
  const { attendeeId, beats } = checkoutSession.metadata;
  if (!attendeeId || !beats) return badMetadata('beat purchase', checkoutSession);

  const beatCount = parseInt(beats, 10);
  const now = new Date();
  await Promise.all([
    db.collection('beat_balances').updateOne(
      { attendeeId },
      { $inc: { beats: beatCount }, $set: { updatedAt: now } },
      { upsert: true }
    ),
    db.collection('beat_transactions').insertOne({
      attendeeId,
      type: 'purchase',
      beats: beatCount,
      amountCents: checkoutSession.amount_total,
      stripePaymentIntentId: checkoutSession.payment_intent,
      stripeSessionId: checkoutSession.id,
      createdAt: now,
    }),
  ]);
}

async function handleCheckoutCompleted(client, db, checkoutSession) {
  checkoutSession.metadata = checkoutSession.metadata ?? {};
  switch (checkoutSession.metadata.type) {
    case 'direct_tip':        return handleDirectTip(db, checkoutSession);
    case 'session_extension': return handleSessionExtension(db, checkoutSession);
    case 'dj_session':        return handleSessionPurchase(client, db, checkoutSession);
    case 'session_add_on':    return handleSessionAddOn(client, db, checkoutSession);
    default:                  return handleBeatPurchase(db, checkoutSession);
  }
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

  if (event.type !== 'checkout.session.completed') return res.status(200).json({ received: true });

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  // Stripe retries deliveries; process each event exactly once.
  if (!(await claimStripeEvent(db, event))) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    await handleCheckoutCompleted(client, db, event.data.object);
  } catch (err) {
    console.error('Webhook processing failed for', event.id, err);
    await releaseStripeEvent(db, event); // let Stripe's retry try again
    return res.status(500).json({ error: 'Processing failed' });
  }

  return res.status(200).json({ received: true });
}
