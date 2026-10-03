'use strict';
const {
  dbToGain, clampDb, normalizeSettings, sameSettings, playLengthMs, DEFAULT_SETTINGS,
} = require('../lib/client/dj/plugins/localFiles/trackSettings');

describe('dbToGain', () => {
  test('0 dB is unchanged, +6 dB roughly doubles, -6 dB roughly halves', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(6)).toBeCloseTo(1.995, 2);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 2);
  });
});

describe('clampDb', () => {
  test('clamps to ±12 dB in half-dB steps', () => {
    expect(clampDb(20)).toBe(12);
    expect(clampDb(-30)).toBe(-12);
    expect(clampDb(2.3)).toBe(2.5);
    expect(clampDb('x')).toBe(0);
  });
});

describe('normalizeSettings', () => {
  test('fills defaults', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  test('rounds points to 0.1s and drops zero/invalid ones', () => {
    expect(normalizeSettings({ inSec: 12.345, outSec: 0 })).toMatchObject({ inSec: 12.3, outSec: null });
    expect(normalizeSettings({ inSec: -5, outSec: 'soon' })).toMatchObject({ inSec: null, outSec: null });
  });

  test('drops an In point too close to (or after) the Out point', () => {
    expect(normalizeSettings({ inSec: 100, outSec: 105 })).toMatchObject({ inSec: null, outSec: 105 });
    expect(normalizeSettings({ inSec: 10, outSec: 180 })).toMatchObject({ inSec: 10, outSec: 180 });
  });

  test('normalises tempo (normal speed stored as null)', () => {
    expect(normalizeSettings({ tempo: 1 }).tempo).toBeNull();
    expect(normalizeSettings({ tempo: 0.9 }).tempo).toBe(0.9);
  });
});

describe('sameSettings', () => {
  test('compares normalised values', () => {
    expect(sameSettings({ volumeDb: 0 }, DEFAULT_SETTINGS)).toBe(true);
    expect(sameSettings({ volumeDb: 2 }, { volumeDb: 2.1 })).toBe(true); // both round to 2
    expect(sameSettings({ outSec: 150 }, { outSec: 160 })).toBe(false);
  });
});

describe('playLengthMs', () => {
  test('the whole file by default', () => {
    expect(playLengthMs(normalizeSettings({}), 200, 5)).toBe(200_000);
  });

  test('from the In point to the end of the fade after the Out point', () => {
    expect(playLengthMs(normalizeSettings({ inSec: 10, outSec: 150 }), 200, 5)).toBe(145_000);
  });

  test('never past the end of the file', () => {
    expect(playLengthMs(normalizeSettings({ outSec: 198 }), 200, 5)).toBe(200_000);
  });

  test('unknown while the file length is unknown', () => {
    expect(playLengthMs(normalizeSettings({}), NaN, 5)).toBeNull();
  });
});
