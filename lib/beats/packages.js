// Beat purchase tiers. Each beat is worth $0.05 to the DJ.
// Platform cut is built into the purchase price — never shown to users.
// 1 beat = $0.05 face value, but purchase rates range from $0.053–$0.061/beat.
export const BEAT_PACKAGES = [
  { id: 'starter',  label: 'Starter',  priceCents: 499,  base: 75,   bonus: 7,   beats: 82,   featured: false },
  { id: 'standard', label: 'Standard', priceCents: 999,  base: 150,  bonus: 25,  beats: 175,  featured: false },
  { id: 'popular',  label: 'Popular',  priceCents: 2499, base: 400,  bonus: 50,  beats: 450,  featured: true  },
  { id: 'value',    label: 'Value',    priceCents: 4999, base: 800,  bonus: 120, beats: 920,  featured: false },
  { id: 'mega',     label: 'Mega',     priceCents: 9999, base: 1600, bonus: 280, beats: 1880, featured: false },
];

export const BEAT_PACKAGES_BY_ID = Object.fromEntries(BEAT_PACKAGES.map(p => [p.id, p]));
