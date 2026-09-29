'use strict';
const {
  normalizeTempo, tempoOf, effectiveDurationMs, audioPositionMs, retimeForTempo,
} = require('../lib/dj/tempo');

const START = new Date('2026-01-01T20:00:00Z').getTime();
const at = secs => START + secs * 1000;
const iso = secs => new Date(at(secs)).toISOString();

describe('normalizeTempo', () => {
  test('keeps in-range values rounded to 2 decimals', () => {
    expect(normalizeTempo(0.9)).toBe(0.9);
    expect(normalizeTempo(1.104)).toBe(1.1);
  });

  test('clamps to 75%–125%', () => {
    expect(normalizeTempo(0.2)).toBe(0.75);
    expect(normalizeTempo(3)).toBe(1.25);
  });

  test('stores normal speed as null', () => {
    expect(normalizeTempo(1)).toBeNull();
    expect(normalizeTempo(1.001)).toBeNull();
  });

  test('rejects missing, zero, negative and non-numeric values', () => {
    for (const v of [null, undefined, 0, -1, NaN, 'fast', {}]) expect(normalizeTempo(v)).toBeNull();
  });

  test('accepts numeric strings', () => {
    expect(normalizeTempo('0.8')).toBe(0.8);
  });
});

describe('tempoOf', () => {
  test('defaults to 1', () => {
    expect(tempoOf({})).toBe(1);
    expect(tempoOf(null)).toBe(1);
    expect(tempoOf({ tempo: 0.9 })).toBe(0.9);
  });
});

describe('effectiveDurationMs', () => {
  test('slower tempo takes longer', () => {
    expect(effectiveDurationMs(180_000, 0.9)).toBe(200_000);
    expect(effectiveDurationMs(180_000, 1.2)).toBe(150_000);
  });

  test('normal or missing tempo leaves the duration alone', () => {
    expect(effectiveDurationMs(180_000, null)).toBe(180_000);
    expect(effectiveDurationMs(180_000, 1)).toBe(180_000);
  });

  test('passes through a missing duration', () => {
    expect(effectiveDurationMs(null, 0.9)).toBeNull();
    expect(effectiveDurationMs(undefined, 0.9)).toBeUndefined();
  });
});

describe('audioPositionMs', () => {
  test('scales wall-clock time by tempo', () => {
    expect(audioPositionMs({ playStartedAt: iso(0), tempo: 0.8 }, at(10))).toBe(8000);
    expect(audioPositionMs({ playStartedAt: iso(0) }, at(10))).toBe(10_000);
  });

  test('freezes while paused', () => {
    expect(audioPositionMs({ playStartedAt: iso(0), pausedAt: iso(10), tempo: 0.8 }, at(99))).toBe(8000);
  });

  test('is 0 before a track has started', () => {
    expect(audioPositionMs({}, at(10))).toBe(0);
  });
});

describe('retimeForTempo', () => {
  test('keeps the audio position when the tempo changes', () => {
    const playing = { playStartedAt: iso(0), tempo: 1 };
    const patch = retimeForTempo(playing, 0.8, at(40));
    expect(patch.tempo).toBe(0.8);
    // 40s in at 100% = 40s of audio; at 80% that takes 50s of wall-clock time.
    expect(patch.playStartedAt).toBe(iso(-10));
    expect(audioPositionMs({ ...playing, ...patch }, at(40))).toBeCloseTo(40_000);
  });

  test('keeps the position while paused', () => {
    const paused = { playStartedAt: iso(0), pausedAt: iso(30), tempo: 1.2 };
    const patch = retimeForTempo(paused, 1, at(500));
    expect(patch.tempo).toBeNull();
    expect(audioPositionMs({ ...paused, ...patch }, at(500))).toBeCloseTo(36_000);
  });

  test('only sets tempo for a track that has not started', () => {
    expect(retimeForTempo({}, 0.9, at(0))).toEqual({ tempo: 0.9 });
  });
});
