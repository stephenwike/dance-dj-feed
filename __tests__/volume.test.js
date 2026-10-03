'use strict';
const { clampDb, normalizeVolumeDb } = require('../lib/dj/volume');

describe('clampDb', () => {
  test('clamps to ±12 dB in half-dB steps', () => {
    expect(clampDb(20)).toBe(12);
    expect(clampDb(-30)).toBe(-12);
    expect(clampDb(2.3)).toBe(2.5);
    expect(clampDb('x')).toBe(0);
  });
});

describe('normalizeVolumeDb', () => {
  test("null means 'not set' (use the file's saved level)", () => {
    for (const v of [null, undefined, '', 'loud']) expect(normalizeVolumeDb(v)).toBeNull();
  });

  test('keeps an explicit 0 dB, and clamps the rest', () => {
    expect(normalizeVolumeDb(0)).toBe(0);
    expect(normalizeVolumeDb('-3')).toBe(-3);
    expect(normalizeVolumeDb(99)).toBe(12);
  });
});
