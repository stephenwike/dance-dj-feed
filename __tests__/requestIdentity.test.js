'use strict';
const {
  requestKeys, lookupKeys, linkKeys, migrateLinks, recordPlay, historyPick, HISTORY_FILES_PER_KEY,
} = require('../lib/client/dj/plugins/localFiles/requestIdentity');

const tushPush = { danceId: 'd1', danceName: 'Tush Push', songName: 'Boot Scootin Boogie', artist: 'Brooks & Dunn' };
const swap = { ...tushPush, isSongSwap: true, swapSongName: 'Achy Breaky Heart', swapArtist: 'Billy Ray Cyrus' };
const partner = { danceType: 'partner', danceName: 'Partner — Two-Step', songName: 'Neon Moon', artist: 'Brooks & Dunn', catalogTrackId: 'musicbrainz:nm' };
const typedDance = { danceName: 'Copperhead Road' };

describe('requestKeys', () => {
  test('a catalog line dance is about the dance', () => {
    expect(requestKeys(tushPush)).toEqual({
      danceKey: 'dance:d1', songKey: 'song-name:boot scootin boogie|brooks and dunn', aboutSong: false,
    });
  });

  test('a typed dance is keyed by its normalised name', () => {
    expect(requestKeys(typedDance).danceKey).toBe('dance-name:copperhead road');
  });

  test('a song swap is about the swapped-in song', () => {
    expect(requestKeys(swap)).toEqual({
      danceKey: 'dance:d1', songKey: 'song-name:achy breaky heart|billy ray cyrus', aboutSong: true,
    });
  });

  test('a partner request is about its song, preferring the catalog id', () => {
    expect(requestKeys(partner)).toEqual({ danceKey: null, songKey: 'song:musicbrainz:nm', aboutSong: true });
  });

  test('a generic partner request has no keys', () => {
    expect(requestKeys({ danceType: 'partner', danceName: 'Partner Dance' })).toEqual({ danceKey: null, songKey: null, aboutSong: true });
  });
});

describe('lookupKeys / linkKeys', () => {
  test('a line dance looks up its dance first, then its song', () => {
    expect(lookupKeys(tushPush)).toEqual(['dance:d1', 'song-name:boot scootin boogie|brooks and dunn']);
  });

  test('a line dance links the dance, plus its catalog song when it names one exactly', () => {
    expect(linkKeys(tushPush)).toEqual(['dance:d1']);
    expect(linkKeys({ ...typedDance, catalogTrackId: 'musicbrainz:c' })).toEqual(['dance-name:copperhead road', 'song:musicbrainz:c']);
  });

  test('swaps and partner requests look up and link only their song', () => {
    expect(lookupKeys(swap)).toEqual(['song-name:achy breaky heart|billy ray cyrus']);
    expect(linkKeys(swap)).toEqual(['song-name:achy breaky heart|billy ray cyrus']);
    expect(linkKeys(partner)).toEqual(['song:musicbrainz:nm']);
  });
});

describe('migrateLinks', () => {
  test('reads bare catalog ids (the old format) as song keys and keeps new keys', () => {
    expect(migrateLinks({ 'musicbrainz:1': 'a.mp3', 'dance:d1': 'b.mp3' }))
      .toEqual({ 'song:musicbrainz:1': 'a.mp3', 'dance:d1': 'b.mp3' });
    expect(migrateLinks(undefined)).toEqual({});
  });
});

describe('recordPlay / historyPick', () => {
  test("records under the dance (swaps counted separately) and the song", () => {
    let h = recordPlay({}, tushPush, 'tush.mp3', 1);
    h = recordPlay(h, swap, 'achy.mp3', 2);
    expect(h['dance:d1']).toEqual({
      'tush.mp3': { plays: 1, swapPlays: 0, last: 1 },
      'achy.mp3': { plays: 0, swapPlays: 1, last: 2 },
    });
    expect(h['song-name:achy breaky heart|billy ray cyrus']['achy.mp3'].plays).toBe(1);
  });

  test("a dance's own plays outweigh swaps played for it", () => {
    let h = {};
    h = recordPlay(h, tushPush, 'tush.mp3', 1);
    for (let t = 2; t < 5; t++) h = recordPlay(h, swap, 'achy.mp3', t); // 3 swaps = 0.75
    expect(historyPick(h, tushPush, new Set(['tush.mp3', 'achy.mp3']))).toBe('tush.mp3');
  });

  test('a swap request picks by plays of its song', () => {
    const h = recordPlay({}, swap, 'achy.mp3', 1);
    expect(historyPick(h, swap, new Set(['achy.mp3']))).toBe('achy.mp3');
  });

  test('ignores files no longer in the library, and unknown requests', () => {
    const h = recordPlay({}, tushPush, 'gone.mp3', 1);
    expect(historyPick(h, tushPush, new Set(['other.mp3']))).toBeNull();
    expect(historyPick(h, { danceId: 'zz', danceName: 'Z' }, new Set(['gone.mp3']))).toBeNull();
  });

  test('keeps only the most recently played files per key', () => {
    let h = {};
    for (let i = 0; i < HISTORY_FILES_PER_KEY + 5; i++) h = recordPlay(h, tushPush, `f${i}.mp3`, i);
    const files = Object.keys(h['dance:d1']);
    expect(files).toHaveLength(HISTORY_FILES_PER_KEY);
    expect(files).not.toContain('f0.mp3');
  });

  test('does not mutate the history it was given', () => {
    const h = {};
    recordPlay(h, tushPush, 'x.mp3', 1);
    expect(h).toEqual({});
  });
});
