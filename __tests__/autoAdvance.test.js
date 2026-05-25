'use strict';
const { remainingMs } = require('../lib/client/dj/autoAdvance');

// Note: the "should the timer fire?" gate was previously tested here via
// shouldTimerAdvance(). That logic now lives in StandardAdapter.shouldAutoAdvance
// — see __tests__/controllerAdapters.test.js.

const base = {
  _id: 'r1',
  playStartedAt: new Date(Date.now() - 30_000).toISOString(),
  duration_ms: 180_000,
};

describe('remainingMs', () => {
  test('returns time left until track ends', () => {
    const playing = { ...base, playStartedAt: new Date(Date.now() - 60_000).toISOString(), duration_ms: 180_000 };
    const ms = remainingMs(playing);
    expect(ms).toBeGreaterThan(119_000);
    expect(ms).toBeLessThanOrEqual(120_000);
  });

  test('returns 0 when track has overrun', () => {
    const playing = { ...base, playStartedAt: new Date(Date.now() - 200_000).toISOString(), duration_ms: 180_000 };
    expect(remainingMs(playing)).toBe(0);
  });

  test('defaults duration to 3 minutes when duration_ms is missing', () => {
    const playing = { _id: 'r1', playStartedAt: new Date(Date.now() - 1_000).toISOString() };
    const ms = remainingMs(playing);
    expect(ms).toBeGreaterThan(178_000);
    expect(ms).toBeLessThanOrEqual(180_000);
  });

  test('accepts an explicit now parameter for deterministic testing', () => {
    const now = 1_000_000;
    const playing = { _id: 'r1', playStartedAt: new Date(now - 60_000).toISOString(), duration_ms: 180_000 };
    expect(remainingMs(playing, now)).toBe(120_000);
  });
});
