'use strict';
/**
 * Controller adapter interface (C# IControllerPlugin equivalent).
 *
 * Each adapter represents one playback mode. When a controller marks a
 * request as 'playing' it calls adapter.playingStamps() and merges the
 * result into the PATCH body. This stamps the request so every consumer
 * (dj-feed timer, standard controller timer, future adapters) can route
 * without a cascade of if/else checks.
 *
 * Interface:
 *   id            : string  — unique adapter identifier
 *   shouldAutoAdvance(playing) → bool
 *                 : Return true if the built-in countdown timer should
 *                   advance the queue when the track duration expires.
 *                   Return false if this adapter owns advancement
 *                   externally (e.g. Spotify polling, BPM detection).
 *   playingStamps() → object
 *                 : Extra fields to merge into the PATCH body when
 *                   marking a request as 'playing'.
 *
 * Adding a new adapter:
 *   1. Implement the three members below.
 *   2. Import and use it in your controller page.
 *   3. No changes needed in the dj-feed or existing adapters.
 */

const StandardAdapter = {
  id: 'standard',

  shouldAutoAdvance(playing) {
    if (!playing?._id || !playing?.playStartedAt) return false;
    if (playing?.pausedAt) return false;
    // Suppress timer only if another adapter explicitly claimed this track
    const owner = playing?.advancedBy;
    if (owner && owner !== 'standard') return false;
    return true;
  },

  playingStamps() {
    return { advancedBy: 'standard' };
  },
};

const SpotifyAdapter = {
  id: 'spotify',

  shouldAutoAdvance(_playing) {
    // Spotify polling in the Spotify controller owns all track advancement
    return false;
  },

  playingStamps() {
    return { advancedBy: 'spotify' };
  },
};

module.exports = { StandardAdapter, SpotifyAdapter };
