'use strict';
const { isAvailable } = require('../lib/dj/musicSources');
const {
  walletPriceCents, addOnFor, isPaidPlugin, sessionHasPlugin, addOnsForLaunch, launchCharge,
} = require('../lib/dj/sessionAddOns');

const twoHours = { minutes: 120, label: '2 hrs', priceCents: 200, walletPriceCents: 164 };

describe('session add-ons', () => {
  test('Standard and Local Files are included; Spotify is a paid add-on', () => {
    expect(isPaidPlugin('standard')).toBe(false);
    expect(isPaidPlugin('local-files')).toBe(false);
    expect(isPaidPlugin('spotify')).toBe(true);
    expect(addOnFor('standard')).toBeNull();
    expect(addOnFor('spotify')).toMatchObject({ plugin: 'spotify', label: 'Spotify' });
  });

  test('Spotify and Apple Music are $1 add-ons, coming soon', () => {
    expect(addOnFor('spotify').priceCents).toBe(100);
    expect(addOnFor('apple-music')).toMatchObject({ label: 'Apple Music', priceCents: 100 });
    expect(isAvailable('spotify')).toBe(false);
    expect(isAvailable('apple-music')).toBe(false);
    expect(isAvailable('standard')).toBe(true);
    expect(isAvailable('local-files')).toBe(true);
    expect(isAvailable('napster')).toBe(false);
  });

  test('wallet prices take off the Stripe fee, matching the session tiers', () => {
    expect(walletPriceCents(200)).toBe(164);
    expect(walletPriceCents(400)).toBe(358);
    expect(walletPriceCents(1500)).toBe(1426);
  });

  test('a session may use a paid source only once it has bought it', () => {
    expect(sessionHasPlugin({ addOns: [] }, 'standard')).toBe(true);
    expect(sessionHasPlugin({ addOns: [] }, 'local-files')).toBe(true);
    expect(sessionHasPlugin({ addOns: [] }, 'spotify')).toBe(false);
    expect(sessionHasPlugin(null, 'spotify')).toBe(false);
    expect(sessionHasPlugin({ addOns: ['spotify'] }, 'spotify')).toBe(true);
  });

  test('sessions started before add-ons existed keep every source', () => {
    expect(sessionHasPlugin({ plugin: 'spotify', status: 'active' }, 'spotify')).toBe(true);
  });

  test('launching with a paid source buys it for the session', () => {
    expect(addOnsForLaunch('spotify')).toEqual(['spotify']);
    expect(addOnsForLaunch('local-files')).toEqual([]);
  });

  test('the launch charge is the length plus any add-on, as separate lines', () => {
    expect(launchCharge(twoHours, 'standard')).toEqual({
      items: [{ label: 'DJ Session — 2 hrs', priceCents: 200 }],
      priceCents: 200,
      walletPriceCents: 164,
    });
    const withSpotify = launchCharge(twoHours, 'spotify');
    expect(withSpotify.items).toHaveLength(2);
    expect(withSpotify.items[1].label).toBe('Spotify add-on');
    expect(withSpotify.priceCents).toBe(200 + addOnFor('spotify').priceCents);
    expect(withSpotify.walletPriceCents).toBe(walletPriceCents(withSpotify.priceCents));
  });
});
