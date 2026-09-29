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

module.exports = { remainingMs };
