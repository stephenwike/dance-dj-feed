let lastReceivedAt = null;

export function markWebhookReceived() {
  lastReceivedAt = new Date();
}

export function getStripeStatus() {
  return { active: lastReceivedAt !== null, lastReceivedAt };
}
