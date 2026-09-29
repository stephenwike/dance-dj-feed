'use strict';
const {
  isAudioFile, normalizeText, parseFilename, requestTrack,
  buildLibraryIndex, explainMatch, matchTrack, searchLibrary, EMPTY_INDEX,
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

  test('rejects the same title by a different artist', () => {
    expect(matchTrack(lib, { songName: 'Wagon Wheel', artist: 'Bob Dylan' })).toBeNull();
  });

  test('accepts a same-titled file with no artist tag', () => {
    expect(matchTrack(lib, { songName: 'Untagged Song', artist: 'Anyone' }).key).toBe('e/Untagged.mp3');
  });

  test('without an artist, only an unambiguous title matches', () => {
    expect(matchTrack(lib, { songName: 'Untagged Song' }).key).toBe('e/Untagged.mp3');
    expect(matchTrack(lib, { songName: 'Wagon Wheel' })).toBeNull();
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
    expect(explainMatch(lib, r, { 'musicbrainz:1': 'extended.mp3' })).toEqual({ entry: expect.objectContaining({ key: 'other.mp3' }), via: 'assigned' });
  });

  test('a remembered catalog link beats ISRC and name matching', () => {
    const r = { ...catalogRequest, isrcs: ['USMC18826253'] };
    expect(explainMatch(lib, r, { 'musicbrainz:1': 'extended.mp3' })).toMatchObject({ entry: { key: 'extended.mp3' }, via: 'linked' });
  });

  test('ignores a link to a file that is gone', () => {
    const r = { ...catalogRequest, isrcs: ['USMC18826253'] };
    expect(explainMatch(lib, r, { 'musicbrainz:1': 'deleted.mp3' })).toMatchObject({ via: 'isrc' });
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
    expect(matchTrack(lib, { songName: 'Copperhead Road', duration_ms: 388_500 }).key).toBe('extended.mp3');
    expect(matchTrack(lib, { songName: 'Copperhead Road' })).toBeNull();
  });
});
