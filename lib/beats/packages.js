// Beat purchase tiers. Prices are fixed (immutable).
// base + bonus = total beats delivered. Total × $0.05 must never exceed platform_receives
// (price − stripe_fee), so the platform never loses money on a sale. Bonus beats represent
// the volume incentive — larger packages give a progressively better per-beat rate.
// stripe_fee = round(priceCents × 0.029) + 30 cents (Stripe: 2.9% + $0.30).
export const BEAT_PACKAGES = [
  { id: 'micro',    label: 'Micro',    priceCents: 100,  base: 12,  bonus: 0,   beats: 12,   featured: false },
  { id: 'starter',  label: 'Starter',  priceCents: 499,  base: 75,  bonus: 7,   beats: 82,   featured: false },
  { id: 'standard', label: 'Standard', priceCents: 999,  base: 150, bonus: 25,  beats: 175,  featured: false },
  { id: 'popular',  label: 'Popular',  priceCents: 2499, base: 400, bonus: 50,  beats: 450,  featured: true  },
  { id: 'value',    label: 'Value',    priceCents: 4999, base: 800, bonus: 120, beats: 920,  featured: false },
  { id: 'mega',     label: 'Mega',     priceCents: 9999, base: 1600,bonus: 280, beats: 1880, featured: false },
];

export const BEAT_PACKAGES_BY_ID = Object.fromEntries(BEAT_PACKAGES.map(p => [p.id, p]));
