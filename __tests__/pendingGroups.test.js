'use strict';
const { buildPendingGroups } = require('../lib/client/dj/pendingGroups');

const makeReq = (overrides) => ({
  _id: 'r' + Math.random(),
  danceId: null,
  danceName: 'Dance1',
  status: 'pending',
  isRepeat: false,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const t = (offsetMs = 0) => new Date(1_000_000 + offsetMs).toISOString();

describe('buildPendingGroups — song swap separation', () => {
  test('original and swap requests for the same dance are separate groups', () => {
    const pending = [
      makeReq({ danceName: 'Electric Slide', isSongSwap: false }),
      makeReq({ danceName: 'Electric Slide', isSongSwap: true, swapSongName: 'Boots On' }),
    ];
    const groups = buildPendingGroups(pending, []);
    expect(groups).toHaveLength(2);
  });

  test('two different swap songs for the same dance are separate groups', () => {
    const pending = [
      makeReq({ danceName: 'Electric Slide', isSongSwap: true, swapSongName: 'Boots On' }),
      makeReq({ danceName: 'Electric Slide', isSongSwap: true, swapSongName: 'Country Roads' }),
    ];
    const groups = buildPendingGroups(pending, []);
    expect(groups).toHaveLength(2);
  });

  test('same swap song requested by multiple people is ONE group', () => {
    const pending = [
      makeReq({ danceName: 'Electric Slide', isSongSwap: true, swapSongName: 'Boots On' }),
      makeReq({ danceName: 'Electric Slide', isSongSwap: true, swapSongName: 'Boots On' }),
      makeReq({ danceName: 'Electric Slide', isSongSwap: true, swapSongName: 'BOOTS ON' }), // case-insensitive
    ];
    const groups = buildPendingGroups(pending, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].requests).toHaveLength(3);
  });

  test('queueing the original does not suppress the swap group', () => {
    const pending = [
      makeReq({ danceName: 'Electric Slide', isSongSwap: true, swapSongName: 'Boots On' }),
    ];
    const queue = [
      { _id: 'q1', danceName: 'Electric Slide', status: 'approved', isSongSwap: false },
    ];
    const groups = buildPendingGroups(pending, queue);
    expect(groups).toHaveLength(1); // swap group still visible
    expect(groups[0].swapSongName).toBe('Boots On');
  });

  test('queueing a swap does not suppress the original group', () => {
    const pending = [
      makeReq({ danceName: 'Electric Slide', isSongSwap: false }),
    ];
    const queue = [
      { _id: 'q1', danceName: 'Electric Slide', status: 'approved', isSongSwap: true, swapSongName: 'Boots On' },
    ];
    const groups = buildPendingGroups(pending, queue);
    expect(groups).toHaveLength(1); // original group still visible
  });

  test('swap group carries isSongSwap and swapSongName for display', () => {
    const pending = [
      makeReq({ danceName: 'Electric Slide', isSongSwap: true, swapSongName: 'Boots On', swapArtist: 'Randy Houser' }),
    ];
    const groups = buildPendingGroups(pending, []);
    expect(groups[0].isSongSwap).toBe(true);
    expect(groups[0].swapSongName).toBe('Boots On');
    expect(groups[0].swapArtist).toBe('Randy Houser');
  });
});

describe('buildPendingGroups — re-request vote count', () => {
  test('vote count for a re-requested dance only reflects post-play requests', () => {
    // The 5 original requests were marked as played when the dance played.
    // markSiblingsPlayed handles that — they are NOT in the pending array here.
    // Only the 3 new requests (after the play event) appear.
    const pending = [
      makeReq({ danceName: 'Waterfall', createdAt: t(500) }),
      makeReq({ danceName: 'Waterfall', createdAt: t(600) }),
      makeReq({ danceName: 'Waterfall', createdAt: t(700) }),
    ];
    const queue = [];
    const lastPlayedAt = { waterfall: t(400) }; // dance was played at t(400) — key is normalized lowercase

    const groups = buildPendingGroups(pending, queue, lastPlayedAt);

    expect(groups).toHaveLength(1);
    // Should show 3 (post-play requests only), not 8 (5 original + 3 new)
    expect(groups[0].displayCount).toBe(3);
    expect(groups[0].requests).toHaveLength(3);
  });

  test('displayCount excludes any pre-play requests that slipped through as pending', () => {
    // Edge case: if a pre-play request somehow ended up staying pending
    // (e.g., a race condition), displayCount still excludes it.
    const pending = [
      makeReq({ danceName: 'Waterfall', createdAt: t(100) }), // BEFORE play — should not count
      makeReq({ danceName: 'Waterfall', createdAt: t(500) }), // after play ✓
      makeReq({ danceName: 'Waterfall', createdAt: t(600) }), // after play ✓
    ];
    const queue = [];
    const lastPlayedAt = { waterfall: t(400) }; // normalized lowercase key

    const groups = buildPendingGroups(pending, queue, lastPlayedAt);

    expect(groups[0].displayCount).toBe(2); // only 2 post-play requests
    expect(groups[0].requests).toHaveLength(3); // all 3 still in the group
  });
});

describe('buildPendingGroups — already-queued dance filtering', () => {
  test('shows a pending dance when it is not in the queue', () => {
    const pending = [makeReq({ danceName: 'Waterfall' })];
    const queue = [];
    const groups = buildPendingGroups(pending, queue);
    expect(groups).toHaveLength(1);
    expect(groups[0].danceName).toBe('Waterfall');
  });

  test('hides all pending requests for a dance that is already approved in the queue', () => {
    const pending = [
      makeReq({ danceName: 'Waterfall' }),
      makeReq({ danceName: 'Waterfall' }),
      makeReq({ danceName: 'Waterfall' }),
    ];
    const queue = [{ _id: 'q1', danceName: 'Waterfall', status: 'approved', queuePosition: 1 }];

    const groups = buildPendingGroups(pending, queue);

    expect(groups).toHaveLength(0); // Waterfall disappears entirely from pending panel
  });

  test('hides pending requests for a dance that is currently playing', () => {
    const pending = [makeReq({ danceName: 'Waterfall' })];
    const queue = [{ _id: 'q1', danceName: 'Waterfall', status: 'playing', queuePosition: 1 }];

    const groups = buildPendingGroups(pending, queue);

    expect(groups).toHaveLength(0);
  });

  test('still shows other dances when one dance is queued', () => {
    const pending = [
      makeReq({ danceName: 'Waterfall' }),
      makeReq({ danceName: 'Electric Slide' }),
    ];
    const queue = [{ _id: 'q1', danceName: 'Waterfall', status: 'approved', queuePosition: 1 }];

    const groups = buildPendingGroups(pending, queue);

    expect(groups).toHaveLength(1);
    expect(groups[0].danceName).toBe('Electric Slide');
  });

  test('matches by danceId when available', () => {
    const pending = [makeReq({ danceId: 'dance-abc', danceName: 'Waterfall' })];
    const queue = [{ _id: 'q1', danceId: 'dance-abc', danceName: 'Waterfall', status: 'approved' }];

    const groups = buildPendingGroups(pending, queue);

    expect(groups).toHaveLength(0);
  });

  test('groups remaining pending requests by dance', () => {
    const pending = [
      makeReq({ danceName: 'Electric Slide' }),
      makeReq({ danceName: 'Electric Slide' }),
      makeReq({ danceName: 'Cupid Shuffle' }),
    ];
    const queue = [];
    const groups = buildPendingGroups(pending, queue);

    expect(groups).toHaveLength(2);
    const es = groups.find(g => g.danceName === 'Electric Slide');
    expect(es.requests).toHaveLength(2);
  });

  test('sorts groups by descending fairness score (higher weighted votes first)', () => {
    const pending = [
      makeReq({ danceName: 'Cupid Shuffle', clientId: 'user1' }),
      makeReq({ danceName: 'Electric Slide', clientId: 'user2' }),
      makeReq({ danceName: 'Electric Slide', clientId: 'user3' }),
    ];
    // All requesters have 0 plays → weights are all 1.0
    // Electric Slide score = 2.0, Cupid Shuffle score = 1.0
    const groups = buildPendingGroups(pending, []);

    expect(groups[0].danceName).toBe('Electric Slide'); // higher score first
    expect(groups[1].danceName).toBe('Cupid Shuffle');
  });
});
