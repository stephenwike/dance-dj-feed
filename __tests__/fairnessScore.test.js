'use strict';
const { buildPlaysPerClient, computeScore } = require('../lib/client/dj/fairnessScore');

const req = (clientId, status = 'pending') => ({ _id: Math.random().toString(), clientId, status });

// ── buildPlaysPerClient ───────────────────────────────────────────────────────
describe('buildPlaysPerClient', () => {
  test('counts played requests per client', () => {
    const requests = [
      req('alice', 'played'),
      req('alice', 'played'),
      req('bob',   'played'),
      req('carol', 'pending'),
    ];
    const plays = buildPlaysPerClient(requests);
    expect(plays['alice']).toBe(2);
    expect(plays['bob']).toBe(1);
    expect(plays['carol']).toBeUndefined();
  });

  test('ignores system client IDs (dj, spotify)', () => {
    const requests = [
      req('dj',      'played'),
      req('spotify', 'played'),
      req('alice',   'played'),
    ];
    const plays = buildPlaysPerClient(requests);
    expect(plays['dj']).toBeUndefined();
    expect(plays['spotify']).toBeUndefined();
    expect(plays['alice']).toBe(1);
  });

  test('returns empty object when no plays exist', () => {
    expect(buildPlaysPerClient([req('alice', 'pending')])).toEqual({});
  });
});

// ── computeScore ──────────────────────────────────────────────────────────────
describe('computeScore', () => {
  test('fresh requester (0 plays) contributes weight 1.0', () => {
    const score = computeScore([req('alice')], {});
    expect(score).toBeCloseTo(1.0);
  });

  test('requester with 1 play contributes weight 0.5', () => {
    const score = computeScore([req('alice')], { alice: 1 });
    expect(score).toBeCloseTo(0.5);
  });

  test('requester with 3 plays contributes weight 0.25', () => {
    const score = computeScore([req('alice')], { alice: 3 });
    expect(score).toBeCloseTo(0.25);
  });

  test('multiple requesters — scores are summed', () => {
    const requests = [req('alice'), req('bob')];
    const plays = { alice: 1 }; // bob has 0 plays
    const score = computeScore(requests, plays);
    // alice: 0.5, bob: 1.0
    expect(score).toBeCloseTo(1.5);
  });

  test('system clients are excluded from score', () => {
    const requests = [req('alice'), req('dj'), req('spotify')];
    const score = computeScore(requests, {});
    expect(score).toBeCloseTo(1.0); // only alice counts
  });

  test('returns 0 for empty request list', () => {
    expect(computeScore([], {})).toBe(0);
  });
});

// ── Time decay ───────────────────────────────────────────────────────────────
describe('buildPlaysPerClient — time decay', () => {
  const playedAt = (minutesAgo) =>
    new Date(Date.now() - minutesAgo * 60_000).toISOString();

  test('decay disabled: plays count as full 1.0 regardless of age', () => {
    const requests = [
      { clientId: 'alice', status: 'played', updatedAt: playedAt(90) },
    ];
    const plays = buildPlaysPerClient(requests, { decayEnabled: false });
    expect(plays['alice']).toBeCloseTo(1.0);
  });

  test('just played (0 min ago) counts as ~1.0 even with decay enabled', () => {
    const requests = [
      { clientId: 'alice', status: 'played', updatedAt: playedAt(0) },
    ];
    const plays = buildPlaysPerClient(requests, { decayEnabled: true, halfLifeMinutes: 60 });
    expect(plays['alice']).toBeCloseTo(1.0, 1);
  });

  test('play at one half-life counts as 0.5', () => {
    const now = Date.now();
    const requests = [
      { clientId: 'alice', status: 'played', updatedAt: new Date(now - 60 * 60_000).toISOString() },
    ];
    const plays = buildPlaysPerClient(requests, { decayEnabled: true, halfLifeMinutes: 60, now });
    expect(plays['alice']).toBeCloseTo(0.5);
  });

  test('play at two half-lives counts as 0.25', () => {
    const now = Date.now();
    const requests = [
      { clientId: 'alice', status: 'played', updatedAt: new Date(now - 120 * 60_000).toISOString() },
    ];
    const plays = buildPlaysPerClient(requests, { decayEnabled: true, halfLifeMinutes: 60, now });
    expect(plays['alice']).toBeCloseTo(0.25);
  });

  test('two plays at different times are summed with decay', () => {
    const now = Date.now();
    const requests = [
      { clientId: 'alice', status: 'played', updatedAt: new Date(now - 60 * 60_000).toISOString() },  // 0.5
      { clientId: 'alice', status: 'played', updatedAt: new Date(now - 120 * 60_000).toISOString() }, // 0.25
    ];
    const plays = buildPlaysPerClient(requests, { decayEnabled: true, halfLifeMinutes: 60, now });
    expect(plays['alice']).toBeCloseTo(0.75);
  });

  test('30-minute half-life decays faster than 60-minute', () => {
    const now = Date.now();
    const requests = [
      { clientId: 'alice', status: 'played', updatedAt: new Date(now - 60 * 60_000).toISOString() },
    ];
    const slow = buildPlaysPerClient(requests, { decayEnabled: true, halfLifeMinutes: 60, now });
    const fast = buildPlaysPerClient(requests, { decayEnabled: true, halfLifeMinutes: 30, now });
    expect(fast['alice']).toBeLessThan(slow['alice']);
  });
});

// ── Tip bonus ─────────────────────────────────────────────────────────────────
describe('computeScore — tip bonus', () => {
  test('$0.25 tip adds 0.25 to contribution', () => {
    const requests = [{ ...req('alice'), tipCents: 25 }];
    const score = computeScore(requests, {});
    // base weight 1.0 + tip 0.25 = 1.25
    expect(score).toBeCloseTo(1.25);
  });

  test('$1.00 tip adds 1.0 to contribution', () => {
    const requests = [{ ...req('alice'), tipCents: 100 }];
    const score = computeScore(requests, {});
    expect(score).toBeCloseTo(2.0); // 1.0 base + 1.0 tip
  });

  test('tip stacks on top of reduced weight from prior plays', () => {
    // Satisfied requester (weight 0.5) tips $1.00 → 0.5 + 1.0 = 1.5
    const requests = [{ ...req('alice'), tipCents: 100 }];
    const score = computeScore(requests, { alice: 1 });
    expect(score).toBeCloseTo(1.5);
  });

  test('no tipCents field defaults to zero bonus', () => {
    const score = computeScore([req('alice')], {});
    expect(score).toBeCloseTo(1.0);
  });

  test('tip from system client is ignored', () => {
    const requests = [{ ...req('dj'), tipCents: 100 }];
    expect(computeScore(requests, {})).toBe(0);
  });

  test('large tip cannot make satisfied requester outweigh many fresh requests unfairly', () => {
    // $5 tip from one well-served person: 0.17 + 5.0 = 5.17
    // 6 fresh people with no tip: 6 × 1.0 = 6.0
    const tipRequest = [{ ...req('veteran'), tipCents: 500 }];
    const freshRequests = Array.from({ length: 6 }, (_, i) => req(`user_${i}`));
    const tipScore   = computeScore(tipRequest,   { veteran: 5 });
    const freshScore = computeScore(freshRequests, {});
    expect(freshScore).toBeGreaterThan(tipScore);
  });
});

// ── Fairness scenarios ────────────────────────────────────────────────────────
describe('fairness scenarios', () => {
  test('50 well-served dancers vs 10 newcomers — newcomers are competitive', () => {
    const bigGroupPlays = {};
    const bigGroupRequests = Array.from({ length: 50 }, (_, i) => {
      bigGroupPlays[`user_${i}`] = 3; // each has had 3 dances played
      return req(`user_${i}`);
    });

    const smallGroupRequests = Array.from({ length: 10 }, (_, i) =>
      req(`new_${i}`) // 0 plays each
    );

    const scoreA = computeScore(bigGroupRequests, bigGroupPlays);
    const scoreB = computeScore(smallGroupRequests, {});

    // Without weighting: 50 vs 10 (5× gap). With weighting: ~12.5 vs 10 (1.25× gap).
    expect(scoreA).toBeCloseTo(12.5, 0); // 50 × 0.25
    expect(scoreB).toBeCloseTo(10.0, 0); // 10 × 1.0
    expect(scoreA / scoreB).toBeLessThan(2); // gap narrowed to under 2×
    expect(scoreA / scoreB).toBeGreaterThan(1); // majority still wins
  });

  test('single highly-satisfied requester does not beat multiple fresh ones', () => {
    // 1 person with 9 plays vs 3 newcomers
    const satisfiedScore = computeScore([req('veteran')], { veteran: 9 }); // 0.1
    const freshScore     = computeScore([req('a'), req('b'), req('c')], {}); // 3.0
    expect(freshScore).toBeGreaterThan(satisfiedScore);
  });

  test('dance with no human requesters scores 0 (DJ-added tracks)', () => {
    const score = computeScore([req('dj'), req('spotify')], {});
    expect(score).toBe(0);
  });
});
