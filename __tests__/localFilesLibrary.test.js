'use strict';
const {
  isAudioFile, normalizeText, parseFilename, requestTrack,
  buildLibraryIndex, explainMatch, isGuess, matchTrack, searchLibrary, EMPTY_INDEX,
  closestFiles, titleKey,
} = require('../lib/client/dj/plugins/localFiles/library');

function entry(key, title, artist = '', album = '') {
  return { key, title, artist, album, durationMs: 180_000, size: 1, lastModified: 1 };
}

describe('isAudioFile', () => {
  test('accepts playable audio extensions, case-insensitively', () => {
    expect(isAudioFile('song.mp3')).toBe(true);
    expect(isAudioFile('Song.M4A')).toBe(true);
    expect(isAudioFile('song.flac')).toBe(true);
  });

  test('rejects non-audio files and dotfiles', () => {
    expect(isAudioFile('cover.jpg')).toBe(false);
    expect(isAudioFile('playlist.m3u')).toBe(false);
    expect(isAudioFile('noextension')).toBe(false);
    expect(isAudioFile('._song.mp3')).toBe(false);
  });
});

describe('normalizeText', () => {
  test('lower-cases and strips punctuation', () => {
    expect(normalizeText("Friends In Low Places!")).toBe('friends in low places');
  });

  test('removes accents, bracketed suffixes and feat. credits', () => {
    expect(normalizeText('Café (Radio Edit)')).toBe('cafe');
    expect(normalizeText('Song [Remastered 2011]')).toBe('song');
    expect(normalizeText('Artist feat. Someone Else')).toBe('artist');
  });

  test('treats & and "and" the same', () => {
    expect(normalizeText('Brooks & Dunn')).toBe(normalizeText('Brooks and Dunn'));
  });

  test('handles null/undefined', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('parseFilename', () => {
  test('splits "Artist - Title"', () => {
    expect(parseFilename('Line/Steve Earle - Copperhead Road.mp3'))
      .toEqual({ artist: 'Steve Earle', title: 'Copperhead Road' });
  });

  test('strips leading track numbers', () => {
    expect(parseFilename('Album/01 - Copperhead Road.mp3')).toEqual({ artist: '', title: 'Copperhead Road' });
    expect(parseFilename('Album/07. Copperhead Road.mp3')).toEqual({ artist: '', title: 'Copperhead Road' });
  });

  test('keeps extra " - " segments in the title', () => {
    expect(parseFilename('A - B - C.mp3')).toEqual({ artist: 'A', title: 'B - C' });
  });
});

describe('requestTrack', () => {
  test('uses songName/artist', () => {
    expect(requestTrack({ danceName: 'Copperhead', songName: 'Copperhead Road', artist: 'Steve Earle' }))
      .toEqual({ title: 'Copperhead Road', artist: 'Steve Earle' });
  });

  test('uses the swap song for song swaps', () => {
    expect(requestTrack({ songName: 'Original', artist: 'X', isSongSwap: true, swapSongName: 'Swap', swapArtist: 'Y' }))
      .toEqual({ title: 'Swap', artist: 'Y' });
  });

  test('falls back to the dance name for line dances without a song', () => {
    expect(requestTrack({ danceName: 'Copperhead Road' })).toEqual({ title: 'Copperhead Road', artist: '' });
  });

  test('does not use the dance name for partner dances', () => {
    expect(requestTrack({ danceType: 'partner', danceName: 'Two Step' })).toEqual({ title: '', artist: '' });
  });
});

describe('matchTrack', () => {
  const lib = buildLibraryIndex([
    entry('a/Copperhead Road.mp3', 'Copperhead Road', 'Steve Earle'),
    entry('b/Copperhead Road (Live).mp3', 'Copperhead Road (Live)', 'Steve Earle & The Dukes'),
    entry('c/Wagon Wheel.mp3', 'Wagon Wheel', 'Darius Rucker'),
    entry('d/Wagon Wheel.mp3', 'Wagon Wheel', 'Old Crow Medicine Show'),
    entry('e/Untagged.mp3', 'Untagged Song', ''),
  ]);

  test('prefers an explicit localTrackKey', () => {
    const r = { songName: 'Wagon Wheel', artist: 'Darius Rucker', localTrackKey: 'd/Wagon Wheel.mp3' };
    expect(matchTrack(lib, r).key).toBe('d/Wagon Wheel.mp3');
  });

  test('falls back to matching when the assigned file is gone', () => {
    const r = { songName: 'Wagon Wheel', artist: 'Darius Rucker', localTrackKey: 'moved.mp3' };
    expect(matchTrack(lib, r).key).toBe('c/Wagon Wheel.mp3');
  });

  test('matches title and exact artist', () => {
    expect(matchTrack(lib, { songName: 'Wagon Wheel', artist: 'Old Crow Medicine Show' }).key).toBe('d/Wagon Wheel.mp3');
  });

  test('prefers the exact artist over a partial one', () => {
    expect(matchTrack(lib, { songName: 'Copperhead Road', artist: 'Steve Earle' }).key).toBe('a/Copperhead Road.mp3');
  });

  test('accepts an artist that contains the requested one', () => {
    const only = buildLibraryIndex([entry('x.mp3', 'Copperhead Road', 'Steve Earle & The Dukes')]);
    expect(matchTrack(only, { songName: 'Copperhead Road', artist: 'Steve Earle' }).key).toBe('x.mp3');
  });

  test('never matches the same title by a different artist by name — only suggests it, flagged', () => {
    const match = explainMatch(lib, { songName: 'Wagon Wheel', artist: 'Bob Dylan' });
    expect(match).toMatchObject({ via: 'suggested', artistDiffers: true });
  });

  test('accepts a same-titled file with no artist tag', () => {
    expect(matchTrack(lib, { songName: 'Untagged Song', artist: 'Anyone' }).key).toBe('e/Untagged.mp3');
  });

  test('without an artist, only an unambiguous title matches by name; otherwise it is a guess', () => {
    expect(explainMatch(lib, { songName: 'Untagged Song' })).toMatchObject({ entry: { key: 'e/Untagged.mp3' }, via: 'name' });
    expect(explainMatch(lib, { songName: 'Wagon Wheel' }).via).toBe('suggested');
  });

  test('returns null for unknown titles, null requests and an empty library', () => {
    expect(matchTrack(lib, { songName: 'Nope', artist: 'Nobody' })).toBeNull();
    expect(matchTrack(lib, null)).toBeNull();
    expect(matchTrack(EMPTY_INDEX, { songName: 'Wagon Wheel' })).toBeNull();
  });
});

describe('searchLibrary', () => {
  const lib = buildLibraryIndex([
    entry('Country/Wagon Wheel.mp3', 'Wagon Wheel', 'Darius Rucker', 'True Believers'),
    entry('Country/Copperhead Road.mp3', 'Copperhead Road', 'Steve Earle'),
  ]);

  test('matches every word across title, artist, album and path', () => {
    expect(searchLibrary(lib, 'wagon rucker').map(e => e.key)).toEqual(['Country/Wagon Wheel.mp3']);
    expect(searchLibrary(lib, 'believers').map(e => e.key)).toEqual(['Country/Wagon Wheel.mp3']);
    expect(searchLibrary(lib, 'country')).toHaveLength(2);
  });

  test('returns nothing for a blank query', () => {
    expect(searchLibrary(lib, '   ')).toEqual([]);
  });

  test('respects the limit', () => {
    expect(searchLibrary(lib, 'country', 1)).toHaveLength(1);
  });
});

describe('explainMatch — catalog requests', () => {
  const withLen = (key, title, artist, durationMs, isrcs = []) => ({ ...entry(key, title, artist), durationMs, isrcs });
  const lib = buildLibraryIndex([
    withLen('radio.mp3', 'Copperhead Road', 'Steve Earle', 270_000, ['USMC18826253']),
    withLen('extended.mp3', 'Copperhead Road', 'Steve Earle', 388_000),
    withLen('other.mp3', 'Wagon Wheel', 'Darius Rucker', 296_000),
  ]);
  const catalogRequest = { songName: 'Copperhead Road', artist: 'Steve Earle', catalogTrackId: 'musicbrainz:1' };

  test('an assigned file beats everything', () => {
    const r = { ...catalogRequest, localTrackKey: 'other.mp3', isrcs: ['USMC18826253'] };
    expect(explainMatch(lib, r, { links: { 'song:musicbrainz:1': 'extended.mp3' } })).toEqual({ entry: expect.objectContaining({ key: 'other.mp3' }), via: 'assigned' });
  });

  test('a remembered catalog link beats ISRC and name matching', () => {
    const r = { ...catalogRequest, isrcs: ['USMC18826253'] };
    expect(explainMatch(lib, r, { links: { 'song:musicbrainz:1': 'extended.mp3' } })).toMatchObject({ entry: { key: 'extended.mp3' }, via: 'linked' });
  });

  test('ignores a link to a file that is gone', () => {
    const r = { ...catalogRequest, isrcs: ['USMC18826253'] };
    expect(explainMatch(lib, r, { links: { 'song:musicbrainz:1': 'deleted.mp3' } })).toMatchObject({ via: 'isrc' });
  });

  test('matches the exact recording by ISRC, case-insensitively', () => {
    const r = { songName: 'Something Else Entirely', isrcs: ['usmc18826253'] };
    expect(explainMatch(lib, r)).toMatchObject({ entry: { key: 'radio.mp3' }, via: 'isrc' });
  });

  test('uses length to choose between versions of the same song', () => {
    expect(explainMatch(lib, { ...catalogRequest, duration_ms: 389_500 })).toMatchObject({ entry: { key: 'extended.mp3' }, via: 'name' });
    expect(explainMatch(lib, { ...catalogRequest, duration_ms: 271_000 })).toMatchObject({ entry: { key: 'radio.mp3' }, via: 'name' });
  });

  test('compares against the recording length, not the tempo-adjusted one', () => {
    // 388s played at 80% is served as 485s
    expect(matchTrack(lib, { ...catalogRequest, duration_ms: 485_000, tempo: 0.8 }).key).toBe('extended.mp3');
  });

  test('falls back to the first match when no length is close', () => {
    expect(matchTrack(lib, { ...catalogRequest, duration_ms: 100_000 }).key).toBe('extended.mp3');
  });

  test('without an artist, length can settle an ambiguous title', () => {
    expect(explainMatch(lib, { songName: 'Copperhead Road', duration_ms: 388_500 })).toMatchObject({ entry: { key: 'extended.mp3' }, via: 'name' });
    expect(explainMatch(lib, { songName: 'Copperhead Road' }).via).toBe('suggested');
  });
});

describe('explainMatch — the DJ\'s local memory', () => {
  const withLen = (key, title, artist, durationMs) => ({ ...entry(key, title, artist), durationMs });
  const lib = buildLibraryIndex([
    withLen('tush.mp3', 'Boot Scootin Boogie', 'Brooks & Dunn', 200_000),
    withLen('swap.mp3', 'Achy Breaky Heart', 'Billy Ray Cyrus', 205_000),
    withLen('copper-rd.mp3', 'Copperhead Rd', 'Steve Earle', 270_000),
    withLen('copper-live.mp3', 'Copperhead Road Live', 'Steve Earle', 300_000),
  ]);
  const tushPush = { _id: 'r1', danceId: 'd1', danceName: 'Tush Push', songName: 'Boot Scootin Boogie', artist: 'Brooks & Dunn' };

  test('a file linked to the dance plays for every request of it', () => {
    const r = { ...tushPush, songName: 'Something Else', artist: '' };
    expect(explainMatch(lib, r, { links: { 'dance:d1': 'swap.mp3' } })).toMatchObject({ entry: { key: 'swap.mp3' }, via: 'linked' });
  });

  test("a swap uses its song's link, not the dance's", () => {
    const swap = { ...tushPush, isSongSwap: true, swapSongName: 'Achy Breaky Heart', swapArtist: 'Billy Ray Cyrus' };
    const links = { 'dance:d1': 'tush.mp3', 'song-name:achy breaky heart|billy ray cyrus': 'swap.mp3' };
    expect(explainMatch(lib, swap, { links })).toMatchObject({ entry: { key: 'swap.mp3' }, via: 'linked' });
  });

  test("falls back to the dance's play history when nothing else matches", () => {
    const r = { _id: 'r2', danceId: 'd9', danceName: 'Obscure Dance' };
    const history = { 'dance:d9': { 'swap.mp3': { plays: 3, swapPlays: 0, last: 1 } } };
    const match = explainMatch(lib, r, { history });
    expect(match).toMatchObject({ entry: { key: 'swap.mp3' }, via: 'history' });
    expect(isGuess(match)).toBe(true);
  });

  test('suggests a near-miss title ("Copperhead Rd"), preferring the closer length', () => {
    const r = { songName: 'Copperhead Road', artist: 'Steve Earle', duration_ms: 271_000 };
    const match = explainMatch(lib, r);
    expect(match).toMatchObject({ via: 'suggested' });
    expect(['copper-rd.mp3', 'copper-live.mp3']).toContain(match.entry.key);
    expect(isGuess(match)).toBe(true);
  });

  test('flags a suggestion tagged with a different artist, and never suggests an unrelated title', () => {
    expect(explainMatch(lib, { songName: 'Copperhead Road', artist: 'Someone Else' })).toMatchObject({ via: 'suggested', artistDiffers: true });
    expect(explainMatch(lib, { songName: 'Completely Different Song' })).toBeNull();
  });

  test('prefers a file whose artist matches over one whose tag differs', () => {
    const two = buildLibraryIndex([
      { ...entry('various.mp3', 'Copperhead Rd', 'Various Artists') },
      { ...entry('earle.mp3', 'Copperhead Rd', 'Steve Earle') },
    ]);
    expect(explainMatch(two, { songName: 'Copperhead Road', artist: 'Steve Earle' })).toMatchObject({ entry: { key: 'earle.mp3' }, artistDiffers: false });
  });

  test('an in-queue comment never matches a file, even one with the same title', () => {
    const lastDance = buildLibraryIndex([entry('last-dance.mp3', 'Last Dance', 'Donna Summer')]);
    const comment = { _id: 'm1', danceType: 'message', danceName: 'Last Dance' };
    expect(explainMatch(lastDance, comment)).toBeNull();
    expect(explainMatch(lastDance, { ...comment, localTrackKey: 'last-dance.mp3' }, { links: {} })).toBeNull();
    expect(closestFiles(lastDance, comment)).toEqual([]);
    expect(explainMatch(lastDance, { danceName: 'Last Dance', songName: 'Last Dance' })).not.toBeNull();
  });

  test('exact evidence is not a guess', () => {
    expect(isGuess(explainMatch(lib, tushPush))).toBe(false);
    expect(isGuess(null)).toBe(false);
  });
});

describe('titleKey', () => {
  test('drops release-variant notes that are the same recording', () => {
    expect(titleKey('Copperhead Road - 2008 Remaster')).toBe('copperhead road');
    expect(titleKey('Copperhead Road – Radio Edit')).toBe('copperhead road');
    expect(titleKey('Neon Moon - Single Version')).toBe('neon moon');
  });

  test('keeps notes that name a different recording', () => {
    expect(titleKey('Copperhead Road - Live')).toBe('copperhead road live');
    expect(titleKey('Neon Moon - Acoustic Version')).toBe('neon moon acoustic version');
    expect(titleKey('Boot Scootin Boogie - Club Mix')).toBe('boot scootin boogie club mix'.replace('scootin', 'scooting'));
  });

  test("treats dropped g's as the same word", () => {
    expect(titleKey("Rockin' Robin")).toBe(titleKey('Rocking Robin'));
    expect(titleKey('Boot Scootin Boogie')).toBe(titleKey('Boot Scooting Boogie'));
  });
});

describe('matching real-world tag variations', () => {
  const lib = buildLibraryIndex([
    { ...entry('Brooks & Dunn/Hard Workin Man/03 Boot Scootin Boogie.mp3', 'Boot Scootin’ Boogie - 2008 Remaster', 'Brooks & Dunn'), durationMs: 200_000 },
    { ...entry('Steve Earle/Copperhead Road/01 Copperhead Road.mp3', 'Copperhead Road', ''), durationMs: 270_000 },
    { ...entry('Misc/Tush Push.mp3', 'Tush Push', ''), durationMs: 180_000 },
  ]);

  test('a remaster tag still matches by name', () => {
    const r = { songName: "Boot Scootin' Boogie", artist: 'Brooks & Dunn' };
    expect(explainMatch(lib, r)).toMatchObject({ entry: { key: expect.stringContaining('Boot Scootin') }, via: 'name' });
  });

  test("an untagged file's folders stand in for its artist", () => {
    // Title matches exactly and the artist tag is missing: a name match.
    expect(explainMatch(lib, { songName: 'Copperhead Road', artist: 'Steve Earle' }).via).toBe('name');
    // A near title: suggested, helped by the "Steve Earle" folder.
    const r = { songName: 'Copperhead Rd', artist: 'Steve Earle', duration_ms: 270_000 };
    expect(explainMatch(lib, r)).toMatchObject({ entry: { key: 'Steve Earle/Copperhead Road/01 Copperhead Road.mp3' }, via: 'suggested' });
  });

  test("a line dance's name counts as a second title", () => {
    const r = { danceId: 'd2', danceName: 'Tush Push', songName: 'Some Other Song Title', artist: '' };
    expect(explainMatch(lib, r)).toMatchObject({ entry: { key: 'Misc/Tush Push.mp3' }, via: 'suggested' });
  });
});

describe('closestFiles', () => {
  const lib = buildLibraryIndex([
    entry('a.mp3', 'Wagon Wheel', 'Old Crow Medicine Show'),
    entry('b.mp3', 'Wagon Train Blues', 'Somebody'),
    entry('c.mp3', 'Unrelated', 'Nobody'),
  ]);

  test('lists weak matches too, best first, up to the limit', () => {
    const out = closestFiles(lib, { songName: 'Wagon Wheel Rock', artist: '' }, 3);
    expect(out.map(x => x.entry.key)).toEqual(['a.mp3', 'b.mp3']);
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  test('is empty when no title word is shared', () => {
    expect(closestFiles(lib, { songName: 'Zzz Qqq' })).toEqual([]);
  });
});

describe('suggestions from filenames and the "Find file" search', () => {
  const lib = buildLibraryIndex([
    // Useless tags, good filename.
    { ...entry('Line Dance/Copperhead Road.mp3', 'Track 01', ''), durationMs: 270_000 },
    // Useless tags and filename; only the folder names the song.
    { ...entry('Brooks & Dunn - Boot Scootin Boogie/01 Track.mp3', 'Track 1', ''), durationMs: 200_000 },
    { ...entry('Other/Unrelated.mp3', 'Unrelated', 'Somebody') },
  ]);

  test('a filename can carry the title when the tags do not', () => {
    const match = explainMatch(lib, { songName: 'Copperhead Road', artist: 'Steve Earle' });
    expect(match).toMatchObject({ entry: { key: 'Line Dance/Copperhead Road.mp3' }, via: 'suggested' });
    expect(isGuess(match)).toBe(true); // played, but not saved until accepted
  });

  test('falls back to the top "Find file" result (title words in the folder name)', () => {
    const match = explainMatch(lib, { songName: "Boot Scootin' Boogie", artist: 'Brooks & Dunn' });
    expect(match).toMatchObject({ entry: { key: 'Brooks & Dunn - Boot Scootin Boogie/01 Track.mp3' }, via: 'suggested' });
  });

  test('closest files include "Find file" results', () => {
    const keys = closestFiles(lib, { songName: "Boot Scootin' Boogie" }).map(c => c.entry.key);
    expect(keys).toContain('Brooks & Dunn - Boot Scootin Boogie/01 Track.mp3');
  });

  test('a file tagged with a different artist is suggested, flagged (e.g. compilation credits)', () => {
    expect(explainMatch(lib, { songName: 'Unrelated', artist: 'Someone Else' })).toMatchObject({
      entry: { key: 'Other/Unrelated.mp3' }, via: 'suggested', artistDiffers: true,
    });
  });

  test('"Take Me to the Beach": catalog title with a feat. credit, file tagged by a compilation', () => {
    const beach = buildLibraryIndex([
      { ...entry('Line Dance Hits/Take Me To The Beach.mp3', 'Take Me To The Beach', 'Line Dance Hits 2025'), durationMs: 185_000 },
    ]);
    const request = {
      danceId: 'd96044b64020d7d1fc6acfeb', danceName: 'Take Me to the Beach',
      songName: 'Take Me to the Beach (feat. Baker Boy)', artist: 'Imagine Dragons, Baker Boy', duration_ms: 185_352,
    };
    expect(explainMatch(beach, request)).toMatchObject({
      entry: { key: 'Line Dance Hits/Take Me To The Beach.mp3' }, via: 'suggested', artistDiffers: true,
    });
  });
});
