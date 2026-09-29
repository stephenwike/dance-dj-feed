'use strict';
/**
 * Pure mixing maths for the local-files player (no DOM, so Jest can test it).
 */

// Crossfade lengths offered to the DJ, in seconds (0 = off).
const CROSSFADE_OPTIONS = [0, 3, 6, 10];

// Length of the Fade → Next / Fade out buttons, in seconds.
const MANUAL_FADE_SEC = 5;

/**
 * Volume `p` (0..1) of the way through a fade from `from` to `to`.
 * Equal-power curves: two tracks crossfading this way keep a steady
 * loudness, where a straight line would dip in the middle.
 */
function fadeVolume(from, to, p) {
  const t = Math.min(1, Math.max(0, p));
  const v = to < from
    ? to + (from - to) * Math.cos((t * Math.PI) / 2)
    : from + (to - from) * Math.sin((t * Math.PI) / 2);
  return Math.min(1, Math.max(0, v));
}

/** Wall-clock seconds until the audio ends at its playback rate (Infinity if unknown). */
function secondsLeft({ duration, currentTime, playbackRate = 1 }) {
  if (!Number.isFinite(duration) || duration <= 0) return Infinity;
  return Math.max(0, duration - currentTime) / (playbackRate || 1);
}

/**
 * Whether to start crossfading into the next track now. Needs crossfade on,
 * the next track's file already loaded, and a track long enough that the
 * fade doesn't eat most of it.
 */
function shouldStartCrossfade({ crossfadeSec, secondsLeft: left, duration, nextReady }) {
  if (!crossfadeSec || !nextReady) return false;
  if (!Number.isFinite(duration) || duration < crossfadeSec * 3) return false;
  return left <= crossfadeSec;
}

module.exports = { CROSSFADE_OPTIONS, MANUAL_FADE_SEC, fadeVolume, secondsLeft, shouldStartCrossfade };
