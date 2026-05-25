'use strict';
const { StandardAdapter, SpotifyAdapter } = require('../lib/client/dj/controllerAdapters');

const base = {
  _id: 'r1',
  playStartedAt: new Date(Date.now() - 30_000).toISOString(),
  duration_ms: 180_000,
};

// ── StandardAdapter ───────────────────────────────────────────────────────────
describe('StandardAdapter.shouldAutoAdvance', () => {
  test('returns true for a normal playing item with no advancedBy stamp', () => {
    expect(StandardAdapter.shouldAutoAdvance({ ...base })).toBe(true);
  });

  test('returns true when advancedBy is explicitly "standard"', () => {
    expect(StandardAdapter.shouldAutoAdvance({ ...base, advancedBy: 'standard' })).toBe(true);
  });

  test('returns false when nothing is playing', () => {
    expect(StandardAdapter.shouldAutoAdvance(null)).toBe(false);
    expect(StandardAdapter.shouldAutoAdvance(undefined)).toBe(false);
  });

  test('returns false when playStartedAt is missing', () => {
    expect(StandardAdapter.shouldAutoAdvance({ _id: 'r1' })).toBe(false);
  });

  test('returns false when track is paused', () => {
    expect(StandardAdapter.shouldAutoAdvance({ ...base, pausedAt: new Date().toISOString() })).toBe(false);
  });

  test('returns false when another adapter claimed the track (Spotify)', () => {
    expect(StandardAdapter.shouldAutoAdvance({ ...base, advancedBy: 'spotify' })).toBe(false);
  });

  test('returns false for any unknown future adapter stamp', () => {
    expect(StandardAdapter.shouldAutoAdvance({ ...base, advancedBy: 'apple-music' })).toBe(false);
  });
});

describe('StandardAdapter.playingStamps', () => {
  test('stamps advancedBy as "standard"', () => {
    expect(StandardAdapter.playingStamps()).toEqual({ advancedBy: 'standard' });
  });
});

// ── SpotifyAdapter ────────────────────────────────────────────────────────────
describe('SpotifyAdapter.shouldAutoAdvance', () => {
  test('always returns false — Spotify polling owns advancement', () => {
    expect(SpotifyAdapter.shouldAutoAdvance({ ...base })).toBe(false);
    expect(SpotifyAdapter.shouldAutoAdvance(null)).toBe(false);
  });
});

describe('SpotifyAdapter.playingStamps', () => {
  test('stamps advancedBy as "spotify"', () => {
    expect(SpotifyAdapter.playingStamps()).toEqual({ advancedBy: 'spotify' });
  });
});

// ── Open/closed principle check ───────────────────────────────────────────────
describe('Adding a hypothetical third adapter does not break existing ones', () => {
  const AppleMusicAdapter = {
    id: 'apple-music',
    shouldAutoAdvance: () => false,
    playingStamps: () => ({ advancedBy: 'apple-music' }),
  };

  test('StandardAdapter still suppresses timer when Apple Music stamp is present', () => {
    const playing = { ...base, ...AppleMusicAdapter.playingStamps() };
    expect(StandardAdapter.shouldAutoAdvance(playing)).toBe(false);
  });

  test('SpotifyAdapter is unaffected by Apple Music adapter', () => {
    expect(SpotifyAdapter.shouldAutoAdvance({ ...base })).toBe(false);
  });
});
