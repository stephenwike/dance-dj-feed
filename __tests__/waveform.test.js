'use strict';
const {
  computePeaks, quantizePeaks, dequantizePeaks, soundBounds, snap,
} = require('../lib/client/dj/plugins/localFiles/waveform');

describe('computePeaks', () => {
  test('takes the loudest sample (either sign) of each slice', () => {
    const data = Float32Array.from([0, 0.2, -0.9, 0.1, 0.5, -0.4, 0, 0]);
    expect(computePeaks([data], 4).map(p => +p.toFixed(2))).toEqual([0.2, 0.9, 0.5, 0]);
  });

  test('uses the loudest channel', () => {
    const left = Float32Array.from([0.1, 0.1]);
    const right = Float32Array.from([0.3, 0.05]);
    expect(computePeaks([left, right], 2).map(p => +p.toFixed(2))).toEqual([0.3, 0.1]);
  });

  test('handles more points than samples, and no audio', () => {
    expect(computePeaks([Float32Array.from([0.5])], 3)).toHaveLength(3);
    expect(computePeaks([], 3)).toEqual([0, 0, 0]);
  });
});

describe('quantizePeaks / dequantizePeaks', () => {
  test('round-trip within 1/255', () => {
    const peaks = [0, 0.5, 1, 1.5, -1];
    const back = dequantizePeaks(quantizePeaks(peaks));
    expect(back[1]).toBeCloseTo(0.5, 2);
    expect(back[3]).toBe(1);   // clamped
    expect(back[4]).toBe(0);   // clamped
  });
});

describe('soundBounds', () => {
  test('finds where sound starts and ends', () => {
    // 10 slices over 100s: silent intro (2 slices), sound, silent tail (3 slices)
    const peaks = [0, 0.01, 0.4, 0.8, 0.9, 0.7, 0.5, 0.02, 0, 0];
    expect(soundBounds(peaks, 100)).toEqual({ startSec: 20, endSec: 70 });
  });

  test('is the whole track when it never gets loud', () => {
    expect(soundBounds([0, 0.01, 0], 90)).toEqual({ startSec: 0, endSec: 90 });
  });
});

describe('snap', () => {
  test('moves onto the nearest target within tolerance', () => {
    expect(snap(10.4, [10, 180], 1)).toBe(10);
    expect(snap(179.2, [10, 180], 1)).toBe(180);
  });

  test('leaves the value alone when nothing is close', () => {
    expect(snap(50, [10, 180], 1)).toBe(50);
  });
});
