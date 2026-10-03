'use strict';
/**
 * Waveform maths for the track timeline: a file's loudness reduced to a few
 * hundred points, where its sound starts and ends, and snapping to those.
 * Pure (no DOM) so Jest can test it; decoding lives in decodeWaveform.js.
 */

// Points across the timeline; plenty for a panel a few hundred pixels wide.
const WAVEFORM_POINTS = 600;
// Below this peak (0..1) a stretch counts as silence (intro hiss, fade tails).
const SILENCE_THRESHOLD = 0.03;

/**
 * Peak level (0..1) of each of `points` equal slices of the audio. `channels`
 * is an array of Float32Arrays (one per channel), as from AudioBuffer.
 */
function computePeaks(channels, points = WAVEFORM_POINTS) {
  const length = channels[0]?.length ?? 0;
  const peaks = new Array(points).fill(0);
  if (!length) return peaks;
  for (let p = 0; p < points; p++) {
    const from = Math.floor((p * length) / points);
    const to = Math.max(from + 1, Math.floor(((p + 1) * length) / points));
    let peak = 0;
    for (const data of channels) {
      for (let i = from; i < to; i++) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
    }
    peaks[p] = Math.min(1, peak);
  }
  return peaks;
}

/** Peaks stored compactly as 0..255 integers, and back. */
function quantizePeaks(peaks) {
  return peaks.map(p => Math.round(Math.min(1, Math.max(0, p)) * 255));
}
function dequantizePeaks(bytes) {
  return bytes.map(b => b / 255);
}

/**
 * Where the sound starts and ends, in seconds: the first and last slices
 * louder than `threshold`. The whole track if it never gets that loud.
 */
function soundBounds(peaks, durationSec, threshold = SILENCE_THRESHOLD) {
  const first = peaks.findIndex(p => p > threshold);
  if (first < 0 || !durationSec) return { startSec: 0, endSec: durationSec || 0 };
  let last = peaks.length - 1;
  while (last > first && peaks[last] <= threshold) last--;
  const slice = durationSec / peaks.length;
  return { startSec: first * slice, endSec: (last + 1) * slice };
}

/** `sec` moved onto the nearest of `targets` within `toleranceSec`, else unchanged. */
function snap(sec, targets, toleranceSec) {
  let best = sec;
  let bestDist = toleranceSec;
  for (const t of targets) {
    const d = Math.abs(t - sec);
    if (d <= bestDist) { best = t; bestDist = d; }
  }
  return best;
}

module.exports = {
  WAVEFORM_POINTS, SILENCE_THRESHOLD,
  computePeaks, quantizePeaks, dequantizePeaks, soundBounds, snap,
};
