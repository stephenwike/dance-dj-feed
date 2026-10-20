'use strict';
const { newShareToken, isShareToken, validTimeZone, toPublicReport, getSharedReport } = require('../lib/server/dj/shareLogic');
const { shareMeta, shareSummary } = require('../lib/dj/shareFormat');

const session = {
  _id: 's1', name: 'Friday Night', ownerId: 'dj1', status: 'closed',
  startedAt: new Date('2026-10-18T01:00:00Z'), closedAt: new Date('2026-10-18T04:12:00Z'),
  shareTimeZone: 'America/Denver',
};

const at = min => new Date(Date.UTC(2026, 9, 18, 1, min));

describe('share tokens', () => {
  test('are 16 url-safe characters, and only those pass', () => {
    const t = newShareToken();
    expect(isShareToken(t)).toBe(true);
    expect(newShareToken()).not.toBe(t);
    expect(isShareToken('short')).toBe(false);
    expect(isShareToken({ $ne: null })).toBe(false);
  });

  test('time zones are checked', () => {
    expect(validTimeZone('America/Denver')).toBe('America/Denver');
    expect(validTimeZone('Not/AZone')).toBeNull();
    expect(validTimeZone(undefined)).toBeNull();
  });
});

describe('toPublicReport', () => {
  const report = {
    playedTracks: [
      { danceName: 'Tush Push', songName: 'Swingin', artist: 'John Anderson', difficulty: 'Beginner', playedAt: at(30), requesterCount: 1,
        requesters: [{ clientId: 'c1', requesterName: 'Pat', tipCents: 500 }], totalTips: 500 },
      { danceName: 'Copperhead Road', songName: 'Copperhead Road', artist: 'Steve Earle', playedAt: at(5), requesterCount: 4,
        requesters: [], totalTips: 0 },
      { danceName: 'Swap Dance', songName: 'Original', isSongSwap: true, swapSongName: 'Swapped', swapArtist: 'Someone', playedAt: at(40), requesterCount: 2 },
      { danceName: 'Two Step', danceType: 'partner', partnerStyle: 'Two Step', playedAt: at(50), requesterCount: 0 },
    ],
    stats: { totalRequests: 12, uniqueRequesters: 7, totalTipCents: 500 },
  };

  const pub = toPublicReport({ session, report, hostName: 'Stephen' });

  test('lists dances in play order with request counts, and swaps show the song that played', () => {
    expect(pub.tracks.map(t => t.danceName)).toEqual(['Copperhead Road', 'Tush Push', 'Swap Dance', 'Two Step']);
    expect(pub.tracks[0].requests).toBe(4);
    expect(pub.tracks[2]).toMatchObject({ songName: 'Swapped', artist: 'Someone' });
  });

  test('totals, most-requested dances and duration', () => {
    expect(pub.stats).toEqual({ dances: 4, lineDances: 3, partnerDances: 1, requests: 12, dancers: 7 });
    expect(pub.topDances).toEqual([
      { danceName: 'Copperhead Road', requests: 4 },
      { danceName: 'Swap Dance', requests: 2 },
      { danceName: 'Tush Push', requests: 1 },
    ]);
    expect(pub.durationMs).toBe((3 * 60 + 12) * 60000);
    expect(pub.live).toBe(false);
    expect(pub.timeZone).toBe('America/Denver');
  });

  test('never includes requesters, tips or the owner id', () => {
    const json = JSON.stringify(pub);
    expect(json).not.toMatch(/Pat|c1|tip|Tips|dj1|requesters/i);
  });

  test('a live session is built from its requests', () => {
    const requests = [
      { danceName: 'Tush Push', status: 'played', updatedAt: at(10), clientId: 'a' },
      { danceName: 'Tush Push', status: 'played', updatedAt: at(12), clientId: 'b' },
      { danceName: 'Cha Cha Slide', status: 'playing', clientId: 'a' },
      { danceName: 'Lesson', danceType: 'message', status: 'played', updatedAt: at(1), clientId: 'dj' },
      { danceName: 'Electric Slide', status: 'played', updatedAt: at(20), clientId: 'dj' },
    ];
    const live = toPublicReport({ session: { ...session, status: 'active', closedAt: null }, report: null, requests });
    expect(live.live).toBe(true);
    expect(live.durationMs).toBeNull();
    expect(live.tracks.map(t => [t.danceName, t.requests])).toEqual([['Tush Push', 2], ['Electric Slide', 1]]);
    expect(live.stats).toMatchObject({ dances: 2, requests: 4, dancers: 2 });
  });

  test('meta and summary text use the DJ\'s time zone', () => {
    // 01:00 UTC on Oct 18 is still the evening of Oct 17 in Denver.
    expect(shareMeta(pub)).toBe('Sat, Oct 17, 2026 · 3h 12m · DJ Stephen');
    expect(shareSummary(pub)).toBe('4 dances · 7 dancers · 12 requests');
  });
});

describe('getSharedReport', () => {
  test('rejects malformed tokens without touching the database', async () => {
    const client = { db: () => { throw new Error('should not query'); } };
    expect(await getSharedReport(client, '../etc')).toBeNull();
    expect(await getSharedReport(client, undefined)).toBeNull();
  });
});
