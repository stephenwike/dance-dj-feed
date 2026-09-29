'use strict';
// Stripe card processing fee (2.9% + $0.30), rounded up to the nearest cent.
// Direct tips add this on top so the DJ receives the full tip amount; the
// attendee page shows the same figure before checkout.
function stripeFeeCents(amountCents) {
  return Math.ceil(amountCents * 0.029 + 30);
}

module.exports = { stripeFeeCents };
