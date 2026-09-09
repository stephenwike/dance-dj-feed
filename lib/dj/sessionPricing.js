// Session duration tiers. Each tier maps a duration to a USD price.
// Selected during "Start an Event" and charged via Stripe Checkout
// (or created for free when NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true').
//
// walletPriceCents = priceCents − Stripe fee (2.9% + $0.30), rounded.
// Paying from wallet bypasses Stripe so the platform receives the same net
// revenue, and the DJ keeps the difference as a discount.
export const SESSION_DURATIONS = [
  { minutes: 120,  label: '2 hrs',  priceCents: 200,  walletPriceCents: 164 },
  { minutes: 300,  label: '5 hrs',  priceCents: 400,  walletPriceCents: 358 },
  { minutes: 480,  label: '8 hrs',  priceCents: 600,  walletPriceCents: 553 },
  { minutes: 720,  label: '12 hrs', priceCents: 800,  walletPriceCents: 747 },
  { minutes: 1440, label: '1 day',  priceCents: 1500, walletPriceCents: 1426 },
];

export const SESSION_DURATIONS_BY_MINUTES = Object.fromEntries(
  SESSION_DURATIONS.map(d => [d.minutes, d])
);

export const SESSION_PLUGINS = ['standard', 'spotify'];

export const EXTENSION_PRICE_CENTS_PER_HOUR = 100;
