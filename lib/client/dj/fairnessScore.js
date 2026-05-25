'use strict';
/**
 * Fairness-weighted scoring for the pending dance queue.
 *
 * Problem: raw request counts favour large groups and repeat attendees.
 * A group of 50 well-served dancers can drown out 10 newcomers indefinitely.
 *
 * Solution: weight each vote by the requester's satisfaction level.
 *
 *   weight(requester) = 1 / (1 + plays_this_session)
 *
 *   score(dance) = Σ weight(requester_i) for every person who requested it
 *
 * Effect:
 *   - 50 requesters × avg 3 plays = score 12.5  (was 50)
 *   - 10 newcomers  × 0 plays     = score 10.0  (was 10)
 *   The minority is competitive without ever blocking the majority.
 *   The floor stays busy because we sort, not filter.
 *
 * System requesters (clientId 'dj' or 'spotify') are excluded — they have
 * no human behind them and should not influence fairness weighting.
 */

const SYSTEM_CLIENT_IDS = new Set(['dj', 'spotify']);

/**
 * Build a map of clientId → number of dances played this session.
 * Pass the full rawRequests array (all statuses).
 */
/**
 * Build a map of clientId → effective play count.
 *
 * With decayEnabled, plays fade over time using a half-life formula:
 *   contribution = (0.5) ^ (minutes_elapsed / halfLifeMinutes)
 *
 * A play at the half-life is worth 0.5; at 2× half-life it's 0.25.
 * This lets requesters who haven't danced recently regain voting weight.
 *
 * options.now is injectable for deterministic testing.
 */
function buildPlaysPerClient(requests, options = {}) {
  const { decayEnabled = false, halfLifeMinutes = 60, now = Date.now() } = options;
  const plays = {};
  for (const r of requests) {
    if (!r.clientId || SYSTEM_CLIENT_IDS.has(r.clientId)) continue;
    if (r.status !== 'played') continue;
    let contribution = 1.0;
    if (decayEnabled && r.updatedAt) {
      const minutesElapsed = (now - new Date(r.updatedAt).getTime()) / 60_000;
      contribution = Math.pow(0.5, minutesElapsed / halfLifeMinutes);
    }
    plays[r.clientId] = (plays[r.clientId] ?? 0) + contribution;
  }
  return plays;
}

/**
 * Compute the fairness-weighted score for a single dance group.
 * `requests` — the array of request objects for this dance.
 * `playsPerClient` — output of buildPlaysPerClient().
 */
function computeScore(requests, playsPerClient) {
  let score = 0;
  for (const r of requests) {
    if (!r.clientId || SYSTEM_CLIENT_IDS.has(r.clientId)) continue;
    const plays = playsPerClient[r.clientId] ?? 0;
    const baseWeight = 1 / (1 + plays);
    const tipBonus = (r.tipCents ?? 0) / 100; // $1.00 tip = +1.0 weight
    score += baseWeight + tipBonus;
  }
  return score;
}

module.exports = { buildPlaysPerClient, computeScore, SYSTEM_CLIENT_IDS };
