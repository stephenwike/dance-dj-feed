'use strict';
const { markSiblingsPlayed, buildSiblingDanceMatch } = require('../lib/server/dj/requestLogic');

// Build a minimal collection mock that tracks updateMany calls
function makeCol(existingDocs) {
  const docs = existingDocs.map(d => ({ ...d }));
  return {
    updateMany: jest.fn(async (filter, update) => {
      let count = 0;
      for (const doc of docs) {
        if (matchesFilter(doc, filter)) {
          Object.assign(doc, update.$set);
          count++;
        }
      }
      return { modifiedCount: count };
    }),
    _docs: docs,
  };
}

function matchesFilter(doc, filter) {
  for (const [k, v] of Object.entries(filter)) {
    if (typeof v === 'object' && '$ne' in v) {
      if (doc[k] === v.$ne) return false;
      continue;
    }
    if (typeof v === 'object' && '$in' in v) {
      if (!v.$in.includes(doc[k])) return false;
      continue;
    }
    if (doc[k] !== v) return false;
  }
  return true;
}

const SESSION = 'sess1';
const DANCE_MATCH = { danceName: 'Waterfall' };

describe('markSiblingsPlayed', () => {
  test('marks pending sibling requests as played', async () => {
    const col = makeCol([
      { _id: 'r1', sessionId: SESSION, danceName: 'Waterfall', status: 'playing' },
      { _id: 'r2', sessionId: SESSION, danceName: 'Waterfall', status: 'pending' },
    ]);
    await markSiblingsPlayed(col, 'r1', DANCE_MATCH, SESSION);
    expect(col._docs.find(d => d._id === 'r2').status).toBe('played');
  });

  test('marks approved sibling requests as played', async () => {
    const col = makeCol([
      { _id: 'r1', sessionId: SESSION, danceName: 'Waterfall', status: 'playing' },
      { _id: 'r2', sessionId: SESSION, danceName: 'Waterfall', status: 'approved' },
    ]);
    await markSiblingsPlayed(col, 'r1', DANCE_MATCH, SESSION);
    expect(col._docs.find(d => d._id === 'r2').status).toBe('played');
  });

  test('marks skipped sibling requests as played — dance was played even after denial', async () => {
    const col = makeCol([
      { _id: 'r1', sessionId: SESSION, danceName: 'Waterfall', status: 'playing' },
      { _id: 'r2', sessionId: SESSION, danceName: 'Waterfall', status: 'skipped' },
    ]);
    await markSiblingsPlayed(col, 'r1', DANCE_MATCH, SESSION);
    // This was the bug: skipped requests were NOT being marked as played
    expect(col._docs.find(d => d._id === 'r2').status).toBe('played');
  });

  test('does not re-mark already-played sibling requests', async () => {
    const col = makeCol([
      { _id: 'r1', sessionId: SESSION, danceName: 'Waterfall', status: 'playing' },
      { _id: 'r2', sessionId: SESSION, danceName: 'Waterfall', status: 'played' },
    ]);
    await markSiblingsPlayed(col, 'r1', DANCE_MATCH, SESSION);
    expect(col.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ status: { $in: expect.not.arrayContaining(['played']) } }),
      expect.anything()
    );
  });

  test('does not touch the request being marked as played itself', async () => {
    const col = makeCol([
      { _id: 'r1', sessionId: SESSION, danceName: 'Waterfall', status: 'playing' },
    ]);
    await markSiblingsPlayed(col, 'r1', DANCE_MATCH, SESSION);
    // r1 is excluded via $ne — still shows as 'playing' (PATCH handler sets it separately)
    expect(col._docs.find(d => d._id === 'r1').status).toBe('playing');
  });

  test('does not touch requests for different dances', async () => {
    const col = makeCol([
      { _id: 'r1', sessionId: SESSION, danceName: 'Waterfall', status: 'playing' },
      { _id: 'r2', sessionId: SESSION, danceName: 'Electric Slide', status: 'pending' },
    ]);
    await markSiblingsPlayed(col, 'r1', DANCE_MATCH, SESSION);
    expect(col._docs.find(d => d._id === 'r2').status).toBe('pending');
  });

  test('does not touch requests from a different session', async () => {
    const col = makeCol([
      { _id: 'r1', sessionId: SESSION, danceName: 'Waterfall', status: 'playing' },
      { _id: 'r2', sessionId: 'other-session', danceName: 'Waterfall', status: 'pending' },
    ]);
    await markSiblingsPlayed(col, 'r1', DANCE_MATCH, SESSION);
    expect(col._docs.find(d => d._id === 'r2').status).toBe('pending');
  });

  // ── Swap variant isolation ────────────────────────────────────────────────
  test('playing the original does NOT mark the swap variant as played', async () => {
    const col = makeCol([
      { _id: 'r1', sessionId: SESSION, danceName: 'Waterfall', status: 'playing',  isSongSwap: false },
      { _id: 'r2', sessionId: SESSION, danceName: 'Waterfall', status: 'approved', isSongSwap: true, swapSongName: 'Boots On' },
    ]);
    // Match filter for original: isSongSwap must NOT be true
    await markSiblingsPlayed(col, 'r1', { danceName: 'Waterfall', isSongSwap: { $ne: true } }, SESSION);
    expect(col._docs.find(d => d._id === 'r2').status).toBe('approved'); // swap untouched
  });

  test('playing the swap does NOT mark the original as played', async () => {
    const col = makeCol([
      { _id: 'r1', sessionId: SESSION, danceName: 'Waterfall', status: 'playing',  isSongSwap: true,  swapSongName: 'Boots On' },
      { _id: 'r2', sessionId: SESSION, danceName: 'Waterfall', status: 'approved', isSongSwap: false },
    ]);
    // Match filter for swap: isSongSwap true + same swapSongName
    await markSiblingsPlayed(col, 'r1', { danceName: 'Waterfall', isSongSwap: true, swapSongName: 'Boots On' }, SESSION);
    expect(col._docs.find(d => d._id === 'r2').status).toBe('approved'); // original untouched
  });

  test('playing one swap song does NOT mark a different swap song as played', async () => {
    const col = makeCol([
      { _id: 'r1', sessionId: SESSION, danceName: 'Waterfall', status: 'playing',  isSongSwap: true, swapSongName: 'Boots On' },
      { _id: 'r2', sessionId: SESSION, danceName: 'Waterfall', status: 'approved', isSongSwap: true, swapSongName: 'Country Roads' },
    ]);
    await markSiblingsPlayed(col, 'r1', { danceName: 'Waterfall', isSongSwap: true, swapSongName: 'Boots On' }, SESSION);
    expect(col._docs.find(d => d._id === 'r2').status).toBe('approved');
  });

  test('handles a mix: marks pending and skipped, leaves played alone', async () => {
    const col = makeCol([
      { _id: 'r1', sessionId: SESSION, danceName: 'Waterfall', status: 'playing' },
      { _id: 'r2', sessionId: SESSION, danceName: 'Waterfall', status: 'pending' },
      { _id: 'r3', sessionId: SESSION, danceName: 'Waterfall', status: 'skipped' },
      { _id: 'r4', sessionId: SESSION, danceName: 'Waterfall', status: 'played' },
    ]);
    await markSiblingsPlayed(col, 'r1', DANCE_MATCH, SESSION);
    expect(col._docs.find(d => d._id === 'r2').status).toBe('played');
    expect(col._docs.find(d => d._id === 'r3').status).toBe('played');
    expect(col._docs.find(d => d._id === 'r4').status).toBe('played'); // unchanged
  });
});

// ── buildSiblingDanceMatch ────────────────────────────────────────────────────
describe('buildSiblingDanceMatch', () => {
  test('original request matched by danceId — excludes swaps via $ne', () => {
    const match = buildSiblingDanceMatch({ danceId: 'd1', isSongSwap: false });
    expect(match).toEqual({ danceId: 'd1', isSongSwap: { $ne: true } });
  });

  test('original request matched by danceName when no danceId', () => {
    const match = buildSiblingDanceMatch({ danceId: null, danceName: 'Electric Slide', isSongSwap: false });
    expect(match).toEqual({ danceName: 'Electric Slide', isSongSwap: { $ne: true } });
  });

  test('original request with no isSongSwap field (legacy document) also excluded from swaps', () => {
    const match = buildSiblingDanceMatch({ danceId: 'd1' });
    expect(match.isSongSwap).toEqual({ $ne: true });
  });

  test('swap request matched by danceId + isSongSwap true + swapSongName', () => {
    const match = buildSiblingDanceMatch({ danceId: 'd1', isSongSwap: true, swapSongName: 'Boots On' });
    expect(match).toEqual({ danceId: 'd1', isSongSwap: true, swapSongName: 'Boots On' });
  });

  test('swap request does not include $ne — it matches only its specific swap song', () => {
    const match = buildSiblingDanceMatch({ danceId: 'd1', isSongSwap: true, swapSongName: 'Country Roads' });
    expect(match.isSongSwap).toBe(true);
    expect(match.swapSongName).toBe('Country Roads');
    expect(match.isSongSwap).not.toEqual({ $ne: true });
  });
});

// ── Partner dances are unique — PATCH handler skips markSiblingsPlayed ────────
// These tests document the expected DB state IF markSiblingsPlayed were called
// for partner dances (i.e. verifying the filter itself), but the handler never
// calls it for danceType === 'partner'. This documents what NOT to rely on.
describe('markSiblingsPlayed — partner dances are treated as unique', () => {
  test('two partner dance requests with the same name are independent (no automatic sibling marking)', async () => {
    // Demonstrates WHY the PATCH handler skips this for partner dances:
    // without the guard, p2 would be wiped out.
    const col = makeCol([
      { _id: 'p1', sessionId: SESSION, danceName: 'Partner — Waltz', status: 'playing', isSongSwap: false },
      { _id: 'p2', sessionId: SESSION, danceName: 'Partner — Waltz', status: 'approved', isSongSwap: false },
    ]);
    const match = buildSiblingDanceMatch({ danceId: null, danceName: 'Partner — Waltz', isSongSwap: false });
    await markSiblingsPlayed(col, 'p1', match, SESSION);
    // If called, p2 WOULD be marked played — this is why the handler skips it.
    expect(col._docs.find(d => d._id === 'p2').status).toBe('played');
  });
});
