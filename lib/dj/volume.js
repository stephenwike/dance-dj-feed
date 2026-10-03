'use strict';
/**
 * Playback volume for a request, in dB relative to the file as recorded.
 * Shared by the server (validating what's stored on a request) and the
 * local-files player. Stored on the request, like tempo, so any device —
 * e.g. the DJ's phone on the dance floor — can change it and the computer
 * playing the music follows.
 */

const VOLUME_MIN_DB = -12;
const VOLUME_MAX_DB = 12;
const VOLUME_STEP_DB = 0.5;

/** A volume clamped to the supported range in half-dB steps (0 for junk). */
function clampDb(db) {
  const n = Number(db);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.min(VOLUME_MAX_DB, Math.max(VOLUME_MIN_DB, n));
  return Math.round(clamped / VOLUME_STEP_DB) * VOLUME_STEP_DB;
}

/** A request's stored volume: clamped, or null for "not set" (the file's saved/default level). */
function normalizeVolumeDb(v) {
  if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return null;
  return clampDb(v);
}

module.exports = { VOLUME_MIN_DB, VOLUME_MAX_DB, VOLUME_STEP_DB, clampDb, normalizeVolumeDb };
