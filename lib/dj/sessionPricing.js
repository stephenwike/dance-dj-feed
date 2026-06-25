// Session duration tiers. Each tier maps a duration to a USD price.
// Selected during "Start an Event" and charged via Stripe Checkout
// (or created for free when NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true').
export const SESSION_DURATIONS = [
  { minutes: 120,  label: '2 hrs',  priceCents: 300 },
  { minutes: 300,  label: '5 hrs',  priceCents: 500 },
  { minutes: 720,  label: '12 hrs', priceCents: 800 },
  { minutes: 1440, label: '1 day',  priceCents: 1000 },
];

export const SESSION_DURATIONS_BY_MINUTES = Object.fromEntries(
  SESSION_DURATIONS.map(d => [d.minutes, d])
);

export const SESSION_PLUGINS = ['standard', 'spotify'];

export const EXTENSION_PRICE_CENTS_PER_HOUR = 100;
