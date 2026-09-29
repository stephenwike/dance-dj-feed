'use strict';
const { fadeVolume, secondsLeft, shouldStartCrossfade } = require('../lib/client/dj/plugins/localFiles/mixing');

describe('fadeVolume', () => {
  test('starts at `from` and ends at `to`', () => {
    expect(fadeVolume(1, 0, 0)).toBeCloseTo(1);
    expect(fadeVolume(1, 0, 1)).toBeCloseTo(0);
    expect(fadeVolume(0, 1, 0)).toBeCloseTo(0);
    expect(fadeVolume(0, 1, 1)).toBeCloseTo(1);
  });

  test('is equal-power: a crossfade keeps total power constant', () => {
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const out = fadeVolume(1, 0, p);
      const inn = fadeVolume(0, 1, p);
      expect(out ** 2 + inn ** 2).toBeCloseTo(1);
    }
  });

  test('fades from a partial volume', () => {
    expect(fadeVolume(0.5, 0, 0)).toBeCloseTo(0.5);
    expect(fadeVolume(0.5, 1, 1)).toBeCloseTo(1);
  });

  test('clamps progress and volume to 0..1', () => {
    expect(fadeVolume(1, 0, -1)).toBeCloseTo(1);
    expect(fadeVolume(1, 0, 2)).toBeCloseTo(0);
  });
});

describe('secondsLeft', () => {
  test('accounts for playback rate', () => {
    expect(secondsLeft({ duration: 200, currentTime: 190 })).toBe(10);
    expect(secondsLeft({ duration: 200, currentTime: 190, playbackRate: 0.5 })).toBe(20);
  });

  test('is Infinity before the duration is known', () => {
    expect(secondsLeft({ duration: NaN, currentTime: 0 })).toBe(Infinity);
    expect(secondsLeft({ duration: 0, currentTime: 0 })).toBe(Infinity);
  });

  test('never goes negative', () => {
    expect(secondsLeft({ duration: 100, currentTime: 101 })).toBe(0);
  });
});

describe('shouldStartCrossfade', () => {
  const base = { crossfadeSec: 6, secondsLeft: 5, duration: 200, nextReady: true };

  test('starts once the remaining time is within the crossfade', () => {
    expect(shouldStartCrossfade(base)).toBe(true);
    expect(shouldStartCrossfade({ ...base, secondsLeft: 6 })).toBe(true);
    expect(shouldStartCrossfade({ ...base, secondsLeft: 7 })).toBe(false);
  });

  test('never starts when crossfade is off or the next file is not loaded', () => {
    expect(shouldStartCrossfade({ ...base, crossfadeSec: 0 })).toBe(false);
    expect(shouldStartCrossfade({ ...base, nextReady: false })).toBe(false);
  });

  test('skips very short tracks and unknown durations', () => {
    expect(shouldStartCrossfade({ ...base, duration: 15 })).toBe(false);
    expect(shouldStartCrossfade({ ...base, duration: NaN })).toBe(false);
  });
});
