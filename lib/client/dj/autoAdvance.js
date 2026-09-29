'use strict';
/**
 * Timer utilities for the DJ queue auto-advance.
 *
 * Whether the timer should fire at all is determined by the active controller
 * adapter — see lib/client/dj/controllerAdapters.js.
 */

/**
 * Milliseconds remaining until the track should end, based on playStartedAt
 * and duration_ms.  Returns 0 if the track has already overrun.
 */
function remainingMs(playing, now = Date.now()) {
  const total = playing?.duration_ms || 180_000;
  const elapsed = now - new Date(playing.playStartedAt).getTime();
  return Math.max(0, total - elapsed);
}

/**
 * How far into the track playback is, in milliseconds. While paused this
 * stays frozen at the pause point. 0 when the track has no start time.
 */
function elapsedMs(playing, now = Date.now()) {
  if (!playing?.playStartedAt) return 0;
  const ref = playing.pausedAt ? new Date(playing.pausedAt).getTime() : now;
  return Math.max(0, ref - new Date(playing.playStartedAt).getTime());
}

module.exports = { remainingMs, elapsedMs };
