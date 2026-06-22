// Next.js dev server bundles each API route separately, so a plain
// module-level variable would give /api/beats/webhook and
// /api/dev/stripe-status their own independent copies. Stash the value on
// `global` so it's shared across the whole process regardless of bundling.

export function markWebhookReceived() {
  global.__stripeWebhookLastReceivedAt = new Date();
}

export function getStripeStatus() {
  const lastReceivedAt = global.__stripeWebhookLastReceivedAt || null;
  return { active: lastReceivedAt !== null, lastReceivedAt };
}
