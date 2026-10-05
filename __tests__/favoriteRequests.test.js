'use strict';
const { favoriteDanceItems, favoriteSongItems } = require('../lib/client/dancer/favoriteRequests');

const dances = [
  { id: 'd1', danceName: 'Copperhead Road', songName: 'Copperhead Road', artist: 'Steve Earle', difficulty: 'Beginner' },
  { id: 'd2', danceName: 'Tush Push', songName: 'Boot Scootin Boogie', artist: 'Brooks & Dunn' },
  { id: 'd3', danceName: 'Whiskey River' },
  { id: 'd4', danceName: 'Boot Scootin Boogie' },
  { id: 'd5', danceName: 'Not A Favorite' },
];
const favorites = ['d1', 'd2', 'd3', 'd4'];
const t = mins => new Date(Date.UTC(2026, 9, 5, 18, mins)).toISOString();

describe('favorite line dances on the request form', () => {
  const requests = [
    { _id: 'r1', danceId: 'd2', danceName: 'Tush Push', status: 'approved', clientId: 'other' },
    { _id: 'r2', danceId: 'd3', danceName: 'Whiskey River', status: 'pending', clientId: 'me' },
    { _id: 'r3', danceId: 'd4', danceName: 'Boot Scootin Boogie', status: 'played', clientId: 'other', updatedAt: t(5) },
  ];
  const items = favoriteDanceItems({ dances, favoriteIds: favorites, requests, clientId: 'me' });
  const byTitle = Object.fromEntries(items.map(i => [i.title, i]));

  test('only favorites, sorted: available, join, mine, played', () => {
    expect(items.map(i => i.title)).toEqual(['Copperhead Road', 'Tush Push', 'Whiskey River', 'Boot Scootin Boogie']);
  });

  test('statuses and which can be selected', () => {
    expect(byTitle['Copperhead Road']).toMatchObject({ status: { type: 'available' }, selectable: true });
    expect(byTitle['Tush Push']).toMatchObject({ status: { type: 'join', label: 'In queue · you’ll join it' }, selectable: true });
    expect(byTitle['Whiskey River']).toMatchObject({ status: { type: 'mine' }, selectable: false });
    expect(byTitle['Boot Scootin Boogie'].status.type).toBe('played');
    expect(byTitle['Boot Scootin Boogie'].status.label).toMatch(/^Played at /);
    expect(byTitle['Boot Scootin Boogie'].selectable).toBe(false);
  });

  test('each favorite knows its mark, to unfavorite it from the list', () => {
    expect(byTitle['Copperhead Road'].mark).toEqual({ kind: 'favorite', id: 'd1' });
  });

  test('each favorite carries its stepsheet (empty when there is none)', () => {
    const withSheet = favoriteDanceItems({
      dances: [{ id: 's1', danceName: 'Sheet Dance', stepsheet: 'https://example.com/s1' }, { id: 's2', danceName: 'No Sheet' }],
      favoriteIds: ['s1', 's2'], requests: [], clientId: 'me',
    });
    expect(withSheet.map(i => i.stepsheet)).toEqual(['', 'https://example.com/s1']);
  });

  test('the request to send is a normal request for the catalog dance', () => {
    expect(byTitle['Copperhead Road'].payload).toMatchObject({
      danceId: 'd1', danceName: 'Copperhead Road', songName: 'Copperhead Road', artist: 'Steve Earle', difficulty: 'Beginner', danceType: null,
    });
  });

  test('a played dance someone re-requested can be joined again', () => {
    const again = [...requests, { _id: 'r4', danceId: 'd4', danceName: 'Boot Scootin Boogie', status: 'pending', clientId: 'other', createdAt: t(20) }];
    const item = favoriteDanceItems({ dances, favoriteIds: ['d4'], requests: again, clientId: 'me' })[0];
    expect(item.status).toMatchObject({ type: 'join', label: '1 requested · you’ll join it' });
  });

  test('playing now is not selectable', () => {
    const playing = [{ _id: 'p', danceId: 'd1', danceName: 'Copperhead Road', status: 'playing', clientId: 'other' }];
    expect(favoriteDanceItems({ dances, favoriteIds: ['d1'], requests: playing, clientId: 'me' })[0])
      .toMatchObject({ status: { type: 'playing' }, selectable: false });
  });

  test('a typed request with the same name counts', () => {
    const typed = [{ _id: 'x', danceId: null, danceName: 'copperhead road', status: 'pending', clientId: 'me' }];
    expect(favoriteDanceItems({ dances, favoriteIds: ['d1'], requests: typed, clientId: 'me' })[0].status.type).toBe('mine');
  });

  test('no favorites → nothing', () => {
    expect(favoriteDanceItems({ dances, favoriteIds: [], requests, clientId: 'me' })).toEqual([]);
  });
});

describe('favorite songs (partner dances) on the request form', () => {
  const songs = [
    { id: 'mb:1', title: 'Once You Love', artist: 'Steve Earle', durationMs: 200000 },
    { id: 'mb:2', title: 'Neon Moon', artist: 'Brooks & Dunn' },
    { id: 'mb:3', title: 'Amarillo by Morning', artist: 'George Strait' },
  ];
  const requests = [
    { _id: 'p1', danceType: 'partner', catalogTrackId: 'mb:2', status: 'pending', clientId: 'other' },
    { _id: 'p2', danceType: 'partner', catalogTrackId: 'mb:3', status: 'played', clientId: 'other', updatedAt: t(1) },
  ];
  const items = favoriteSongItems({ songs, requests, clientId: 'me' });
  const byTitle = Object.fromEntries(items.map(i => [i.title, i]));

  test('statuses, and joining uses the existing partner request\'s group', () => {
    expect(byTitle['Once You Love']).toMatchObject({ status: { type: 'available' }, selectable: true });
    expect(byTitle['Neon Moon']).toMatchObject({ status: { type: 'join' }, selectable: true });
    expect(byTitle['Neon Moon'].payload.partnerGroupId).toBe('p1');
    expect(byTitle['Amarillo by Morning']).toMatchObject({ status: { type: 'played' }, selectable: false });
  });

  test('the request to send is a partner request linked to the catalog song', () => {
    expect(byTitle['Once You Love'].payload).toEqual({
      danceId: null, danceName: 'Partner Dance', danceType: 'partner', partnerStyle: null,
      songName: 'Once You Love', artist: 'Steve Earle', catalogTrackId: 'mb:1', duration_ms: 200000, notes: '',
    });
  });

  test('each favorite song knows its mark', () => {
    expect(byTitle['Once You Love'].mark).toEqual({ kind: 'song', id: 'mb:1' });
  });

  test('your own request shows as yours', () => {
    const mine = [{ _id: 'p3', danceType: 'partner', catalogTrackId: 'mb:1', status: 'approved', clientId: 'me' }];
    expect(favoriteSongItems({ songs, requests: mine, clientId: 'me' }).find(i => i.title === 'Once You Love').status.type).toBe('mine');
  });
});

describe('wishlist items', () => {
  const { wishlistItems } = require('../lib/client/dancer/favoriteRequests');
  const catalog = [
    { id: 'w1', danceName: 'Zydeco Shuffle', stepsheet: 'https://example.com/zydeco' },
    { id: 'w2', danceName: 'Absolutely', songName: 'Absolutely Everybody', artist: 'Vanessa Amorosi', difficulty: 'Beginner' },
    { id: 'w3', danceName: 'Not On It' },
  ];

  test('lists wishlist dances by title, with stepsheet and refresh', () => {
    const items = wishlistItems({ dances: catalog, wishlistIds: ['w1', 'w2'], refreshIds: ['w2'] });
    expect(items.map(i => i.title)).toEqual(['Absolutely', 'Zydeco Shuffle']);
    expect(items[0]).toMatchObject({ refresh: true, stepsheet: '', sub: 'Absolutely Everybody — Vanessa Amorosi', mark: { kind: 'wishlist', id: 'w2' } });
    expect(items[1]).toMatchObject({ refresh: false, stepsheet: 'https://example.com/zydeco' });
  });

  test('empty wishlist → nothing', () => {
    expect(wishlistItems({ dances: catalog, wishlistIds: [] })).toEqual([]);
  });
});
