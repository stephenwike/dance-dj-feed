'use strict';
const { filterAvailableDances } = require('../lib/client/dj/availableDances');

const t = (offsetMs = 0) => new Date(1_000_000 + offsetMs).toISOString();

// Dances use `id` (string), matching the /api/dj/dances serialisation
const dances = [
  { id: 'd1', danceName: 'Waterfall' },
  { id: 'd2', danceName: 'Electric Slide' },
  { id: 'd3', danceName: 'Cupid Shuffle' },
];

describe('filterAvailableDances', () => {
  test('shows all dances when no requests exist', () => {
    expect(filterAvailableDances(dances, [])).toHaveLength(3);
  });

  // ── Rule 1: currently playing ────────────────────────────────────────────
  test('hides a dance that is currently playing', () => {
    const requests = [{ danceId: 'd1', status: 'playing', createdAt: t(), updatedAt: t() }];
    const result = filterAvailableDances(dances, requests);
    expect(result.map(d => d.id)).not.toContain('d1');
    expect(result).toHaveLength(2);
  });

  // ── Rule 2: already played ────────────────────────────────────────────────
  test('hides a dance that has already been played', () => {
    const requests = [{ danceId: 'd1', status: 'played', createdAt: t(), updatedAt: t(100) }];
    const result = filterAvailableDances(dances, requests);
    expect(result.map(d => d.id)).not.toContain('d1');
  });

  test('keeps dances that have not been played', () => {
    const requests = [{ danceId: 'd1', status: 'played', createdAt: t(), updatedAt: t(100) }];
    const result = filterAvailableDances(dances, requests);
    expect(result.map(d => d.id)).toContain('d2');
    expect(result.map(d => d.id)).toContain('d3');
  });

  // ── Rule 2 exception: re-requested after play ─────────────────────────────
  test('shows a played dance again when it has been re-requested after the play', () => {
    const playedAt = t(100);
    const requests = [
      { danceId: 'd1', status: 'played',   createdAt: t(),     updatedAt: playedAt },
      { danceId: 'd1', status: 'pending',  createdAt: t(200),  updatedAt: t(200) }, // after play
    ];
    const result = filterAvailableDances(dances, requests);
    expect(result.map(d => d.id)).toContain('d1');
  });

  test('does NOT show a played dance if the only pending request was made BEFORE the play', () => {
    const playedAt = t(200);
    const requests = [
      { danceId: 'd1', status: 'pending',  createdAt: t(50),   updatedAt: t(50)  }, // before play
      { danceId: 'd1', status: 'played',   createdAt: t(100),  updatedAt: playedAt },
    ];
    const result = filterAvailableDances(dances, requests);
    expect(result.map(d => d.id)).not.toContain('d1');
  });

  test('approved re-requests (not just pending) also count as re-requested', () => {
    const playedAt = t(100);
    const requests = [
      { danceId: 'd1', status: 'played',   createdAt: t(),     updatedAt: playedAt },
      { danceId: 'd1', status: 'approved', createdAt: t(200),  updatedAt: t(200) },
    ];
    const result = filterAvailableDances(dances, requests);
    expect(result.map(d => d.id)).toContain('d1');
  });

  // ── Edge cases ────────────────────────────────────────────────────────────
  test('custom requests (no danceId) do not affect the catalogue', () => {
    const requests = [{ danceId: null, status: 'played', danceName: 'Custom', createdAt: t(), updatedAt: t() }];
    expect(filterAvailableDances(dances, requests)).toHaveLength(3);
  });

  test('uses the most recent play event when a dance was played multiple times', () => {
    const requests = [
      { danceId: 'd1', status: 'played',   createdAt: t(),     updatedAt: t(100) }, // first play
      { danceId: 'd1', status: 'pending',  createdAt: t(150),  updatedAt: t(150) }, // re-requested
      { danceId: 'd1', status: 'played',   createdAt: t(200),  updatedAt: t(300) }, // second play
      // no re-request after second play
    ];
    const result = filterAvailableDances(dances, requests);
    // The pending request at t(150) predates the second play at t(300), so d1 is hidden
    expect(result.map(d => d.id)).not.toContain('d1');
  });

  test('currently playing beats re-request — dance still hidden while playing', () => {
    const requests = [
      { danceId: 'd1', status: 'playing', createdAt: t(),    updatedAt: t()    },
      { danceId: 'd1', status: 'pending', createdAt: t(500), updatedAt: t(500) },
    ];
    const result = filterAvailableDances(dances, requests);
    expect(result.map(d => d.id)).not.toContain('d1');
  });
});
