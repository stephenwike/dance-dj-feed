'use strict';
const { searchDances } = require('../lib/client/dj/danceSearch');

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
