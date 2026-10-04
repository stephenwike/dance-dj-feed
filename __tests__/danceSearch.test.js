'use strict';
const { searchDances, searchDancesAnyField } = require('../lib/client/dj/danceSearch');

const dances = [
  { id: '1', danceName: 'Copperhead Road', songName: 'Copperhead Road', artist: 'Steve Earle' },
  { id: '2', danceName: 'Tush Push', songName: 'Boot Scootin Boogie', artist: 'Brooks & Dunn' },
  { id: '3', danceName: 'Road Trip', songName: 'Take Me Home', artist: 'John Denver' },
];

describe('searchDances', () => {
  test('searches one field, case-insensitively', () => {
    expect(searchDances(dances, 'songName', 'boot').map(d => d.id)).toEqual(['2']);
    expect(searchDances(dances, 'artist', 'EARLE').map(d => d.id)).toEqual(['1']);
    expect(searchDances(dances, 'danceName', 'boot')).toEqual([]);
  });

  test('lists matches that start with the query first', () => {
    expect(searchDances(dances, 'danceName', 'road').map(d => d.id)).toEqual(['3', '1']);
  });

  test('returns nothing for a blank query and respects the limit', () => {
    expect(searchDances(dances, 'danceName', '  ')).toEqual([]);
    expect(searchDances(dances, 'danceName', 'o', 1)).toHaveLength(1);
  });

  test('tolerates missing fields and rejects unknown ones', () => {
    expect(searchDances([{ id: 'x' }], 'artist', 'a')).toEqual([]);
    expect(() => searchDances(dances, 'difficulty', 'a')).toThrow();
  });
});

describe('searchDancesAnyField', () => {
  const catalog = [
    { id: '1', danceName: 'Boot Scootin Boogie', songName: 'Boot Scootin Boogie', artist: 'Brooks & Dunn' },
    { id: '2', danceName: 'Tush Push', songName: 'Boot Scootin Boogie (Remix)', artist: 'Brooks & Dunn' },
    { id: '3', danceName: 'Neon Moon Waltz', songName: 'Neon Moon', artist: 'Brooks & Dunn' },
    { id: '4', danceName: 'Copperhead', songName: 'Copperhead Road', artist: 'Steve Earle' },
  ];

  test('lists the typed-in field first, then song, then artist matches', () => {
    const out = searchDancesAnyField(catalog, 'danceName', 'boot');
    expect(out.map(r => [r.dance.id, r.matchedOn])).toEqual([['1', 'danceName'], ['2', 'songName']]);
  });

  test('a song typed into the dance box still finds the dance by its song', () => {
    expect(searchDancesAnyField(catalog, 'danceName', 'copperhead road').map(r => r.dance.danceName)).toEqual(['Copperhead']);
  });

  test('the Song box puts song matches first, then dance names, then artists', () => {
    const out = searchDancesAnyField(catalog, 'songName', 'neon');
    expect(out.map(r => [r.dance.id, r.matchedOn])).toEqual([['3', 'songName']]);
    expect(searchDancesAnyField(catalog, 'songName', 'tush').map(r => r.matchedOn)).toEqual(['danceName']);
  });

  test('the Artist box falls back to dance and song names', () => {
    expect(searchDancesAnyField(catalog, 'artist', 'earle').map(r => r.dance.id)).toEqual(['4']);
    expect(searchDancesAnyField(catalog, 'artist', 'copperhead').map(r => r.matchedOn)).toEqual(['danceName']);
  });

  test('each dance appears once, under the first field it matched', () => {
    const out = searchDancesAnyField(catalog, 'artist', 'brooks');
    expect(out).toHaveLength(3);
    expect(new Set(out.map(r => r.dance.id)).size).toBe(3);
  });

  test('respects the limit, and returns nothing for a blank query', () => {
    expect(searchDancesAnyField(catalog, 'artist', 'brooks', 2)).toHaveLength(2);
    expect(searchDancesAnyField(catalog, 'danceName', '  ')).toEqual([]);
  });
});
