'use strict';
/**
 * Playback tempo for a request, shared by the server (effective durations)
 * and the local-files player (audio position).
 *
 * `tempo` is a playback-rate multiplier stored on the request (1 = normal,
 * 0.9 = 10% slower). Everything else in the app works in wall-clock time:
 * playStartedAt/pausedAt are wall-clock and duration_ms (as served) is how
 * long the track takes to play at its tempo. So countdowns, queue ETAs and
 * the feed need no tempo awareness of their own.
 */

const TEMPO_MIN = 0.75;
const TEMPO_MAX = 1.25;

/** A stored tempo: clamped to the supported range, 2 decimals; null means normal. */
function normalizeTempo(v) {
  const n = Number(v);
  if (v === null || v === undefined || !Number.isFinite(n) || n <= 0) return null;
  const clamped = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, n));
  const rounded = Math.round(clamped * 100) / 100;
  return rounded === 1 ? null : rounded;
}

function tempoOf(request) {
  return normalizeTempo(request?.tempo) ?? 1;
}

/** Wall-clock length of a track of `baseMs` played at `tempo`. */
function effectiveDurationMs(baseMs, tempo) {
  if (baseMs === null || baseMs === undefined) return baseMs;
  return Math.round(baseMs / (normalizeTempo(tempo) ?? 1));
}

/** Wall-clock time since the track started, frozen while paused. */
function elapsedWallMs(request, now) {
  if (!request?.playStartedAt) return 0;
  const ref = request.pausedAt ? new Date(request.pausedAt).getTime() : now;
  return Math.max(0, ref - new Date(request.playStartedAt).getTime());
}

/** Position within the audio file, in ms, accounting for tempo. */
function audioPositionMs(request, now = Date.now()) {
  return elapsedWallMs(request, now) * tempoOf(request);
}

/**
 * Fields to PATCH to change a playing request's tempo without jumping in the
 * song: playStartedAt is moved so the audio position stays where it is.
 */
function retimeForTempo(request, newTempo, now = Date.now()) {
  const tempo = normalizeTempo(newTempo);
  const out = { tempo };
  if (request?.playStartedAt) {
    const positionMs = audioPositionMs(request, now);
    const ref = request.pausedAt ? new Date(request.pausedAt).getTime() : now;
    out.playStartedAt = new Date(ref - positionMs / (tempo ?? 1)).toISOString();
  }
  return out;
}

module.exports = {
  TEMPO_MIN, TEMPO_MAX,
  normalizeTempo, tempoOf, effectiveDurationMs, audioPositionMs, retimeForTempo,
};
