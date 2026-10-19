'use strict';
/**
 * Per-file playback settings the DJ saves for a track: loudness, where it
 * starts (In), where its fade-out starts (Out), and tempo. Kept locally per
 * DJ (libraryStore.js), keyed by file, and applied whenever that file plays.
 *
 *   { volumeDb, inSec, outSec, tempo }
 *     volumeDb — gain in dB, VOLUME_MIN_DB..VOLUME_MAX_DB (0 = as recorded)
 *     inSec    — playback starts here (null = the beginning)
 *     outSec   — the fade-out/crossfade to the next track starts here
 *                (null = near the end, as usual)
 *     tempo    — playback rate to start at (null = normal speed)
 */
const { normalizeTempo } = require('../../../../dj/tempo');
const { VOLUME_MIN_DB, VOLUME_MAX_DB, clampDb } = require('../../../../dj/volume');
const { soundBounds } = require('./waveform');

// A track trimmed with an In point fades in over this long.
const IN_FADE_SEC = 1.5;
// Out points need the In point this far before them, so a track can't be trimmed to nothing.
const MIN_PLAY_SEC = 10;
// Trim silence: shorter silences are left alone.
const AUTO_TRIM_MIN_SEC = 0.5;
// …and a trimmed start begins this far before the sound, fading in this fast
// (over silence, so the first beat plays at full level).
const AUTO_IN_LEAD_SEC = 0.1;
const AUTO_IN_FADE_SEC = 0.1;

const DEFAULT_SETTINGS = Object.freeze({ volumeDb: 0, inSec: null, outSec: null, tempo: null });

function dbToGain(db) {
  return 10 ** (db / 20);
}

function pointOrNull(sec) {
  const n = Number(sec);
  return sec === null || sec === undefined || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 10) / 10;
}

/** Settings made safe to apply: clamped, rounded, and In before Out. */
function normalizeSettings(raw) {
  const volumeDb = clampDb(raw?.volumeDb ?? 0);
  let inSec = pointOrNull(raw?.inSec);
  const outSec = pointOrNull(raw?.outSec);
  if (inSec !== null && outSec !== null && outSec - inSec < MIN_PLAY_SEC) inSec = null;
  return { volumeDb, inSec, outSec, tempo: normalizeTempo(raw?.tempo) };
}

/** Whether two settings would play the same way. */
function sameSettings(a, b) {
  const x = normalizeSettings(a);
  const y = normalizeSettings(b);
  return x.volumeDb === y.volumeDb && x.inSec === y.inSec && x.outSec === y.outSec && x.tempo === y.tempo;
}

/**
 * How long a file plays with these settings, in ms at normal speed: from
 * the In point to the end of the fade-out that starts at the Out point (or
 * to the end of the file). Null while the file's length is unknown.
 */
function playLengthMs(settings, fileDurationSec, fadeSec) {
  if (!Number.isFinite(fileDurationSec) || fileDurationSec <= 0) return null;
  const start = settings.inSec ?? 0;
  const end = settings.outSec !== null ? Math.min(fileDurationSec, settings.outSec + fadeSec) : fileDurationSec;
  return Math.max(0, Math.round((end - start) * 1000));
}

const NO_AUTO = Object.freeze({ inSec: null, outSec: null });

/**
 * Trim silence: put the In point just before the sound starts and the Out
 * point where it ends (see waveform.soundBounds), except where the DJ saved
 * a point of their own. `wave` is { peaks, durationSec }, or null if not
 * known yet. Returns { settings, auto }: auto holds the points that were
 * filled in (null where none was).
 */
function trimSilence(settings, wave) {
  const none = { settings, auto: NO_AUTO };
  if (!wave?.durationSec) return none;
  const { startSec, endSec } = soundBounds(wave.peaks, wave.durationSec);
  const lead = startSec - AUTO_IN_LEAD_SEC;
  const autoIn = settings.inSec === null && lead >= AUTO_TRIM_MIN_SEC ? lead : null;
  const autoOut = settings.outSec === null && wave.durationSec - endSec >= AUTO_TRIM_MIN_SEC ? endSec : null;
  if (autoIn === null && autoOut === null) return none;
  const trimmed = normalizeSettings({ ...settings, inSec: autoIn ?? settings.inSec, outSec: autoOut ?? settings.outSec });
  // Too short to trim both ends (normalizeSettings dropped the In point): leave it as saved.
  if (trimmed.inSec !== normalizeSettings({ inSec: autoIn ?? settings.inSec }).inSec) return none;
  return {
    settings: trimmed,
    auto: { inSec: autoIn !== null ? trimmed.inSec : null, outSec: autoOut !== null ? trimmed.outSec : null },
  };
}

module.exports = {
  VOLUME_MIN_DB, VOLUME_MAX_DB, IN_FADE_SEC, AUTO_IN_FADE_SEC, MIN_PLAY_SEC, DEFAULT_SETTINGS, NO_AUTO,
  dbToGain, clampDb, normalizeSettings, sameSettings, playLengthMs, trimSilence,
};
