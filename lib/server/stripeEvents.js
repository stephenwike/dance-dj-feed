'use strict';
// Stripe delivers webhooks at-least-once and retries on timeouts/5xx, so the
// same checkout.session.completed can arrive more than once. Each event id is
// claimed before it is processed; a duplicate delivery finds the claim and is
// acknowledged without doing anything.

/** Returns true if this call claimed the event, false if it was already processed. */
async function claimStripeEvent(db, event) {
  try {
    await db.collection('stripe_events').insertOne({ _id: event.id, type: event.type, receivedAt: new Date() });
    return true;
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

/** Undo a claim when processing failed, so Stripe's retry can process it. */
async function releaseStripeEvent(db, event) {
  await db.collection('stripe_events').deleteOne({ _id: event.id });
}

module.exports = { claimStripeEvent, releaseStripeEvent };
