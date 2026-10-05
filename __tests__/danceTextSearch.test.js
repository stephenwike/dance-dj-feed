'use strict';
const { normalizeSearchText, danceMatches, danceSearchText, matchesAllWords } = require('../lib/client/dj/danceTextSearch');

const copperhead = {
  danceName: 'Copperhead Road', songName: 'Copperhead Road', artist: 'Steve Earle',
  difficulty: 'Beginner', choreographers: ['Unknown Choreographer'],
};
const dont = { danceName: 'Don’t Call Me', songName: 'Dont Call Me', artist: 'maryjo', difficulty: 'Improver', choreographers: ['Maddison Glover'] };
const cafe = { danceName: 'Café Olé', songName: 'Olé', artist: 'Señor Ritmo', difficulty: 'Intermediate' };

describe('dance text search', () => {
  test('matches any field: name, song, artist, difficulty, choreographer', () => {
    expect(danceMatches(copperhead, 'copperhead')).toBe(true);
    expect(danceMatches(copperhead, 'earle')).toBe(true);
    expect(danceMatches(copperhead, 'beginner')).toBe(true);
    expect(danceMatches(dont, 'glover')).toBe(true);
  });

  test('every word must match, in any order, across fields', () => {
    expect(danceMatches(copperhead, 'earle road')).toBe(true);
    expect(danceMatches(copperhead, 'beginner earle')).toBe(true);
    expect(danceMatches(copperhead, 'earle improver')).toBe(false);
  });

  test('ignores case, punctuation and accents', () => {
    expect(danceMatches(dont, 'dont call')).toBe(true);
    expect(danceMatches(dont, "Don't")).toBe(true);
    expect(danceMatches(cafe, 'cafe ole')).toBe(true);
    expect(danceMatches(cafe, 'senor')).toBe(true);
    expect(normalizeSearchText('"A Bar Song" (Tipsy)')).toBe('a bar song tipsy');
  });

  test('extra text (e.g. a favorite\'s status) is searchable too', () => {
    expect(matchesAllWords(danceSearchText(copperhead, 'In queue'), 'queue earle')).toBe(true);
  });

  test('a blank query matches; missing fields are fine', () => {
    expect(danceMatches({ danceName: 'Solo' }, '   ')).toBe(true);
    expect(danceMatches({ danceName: 'Solo' }, 'solo')).toBe(true);
  });
});

describe('search ranking: dance name, then song/artist, then choreographer', () => {
  const { searchDances } = require('../lib/client/dj/danceTextSearch');
  const catalog = [
    { id: 'whitehouse', danceName: 'Cowboy Rhythm', songName: 'Rhythm', artist: 'Band', choreographers: ['Fred Whitehouse'] },
    { id: 'song', danceName: 'Dance Floor', songName: 'Free Fallin', artist: 'Tom Petty' },
    { id: 'freaky', danceName: 'Freaky Skillz', songName: 'Skillz', artist: 'Someone' },
    { id: 'contains', danceName: 'Carefree Highway', songName: 'Highway', artist: 'Band' },
    { id: 'word', danceName: 'Dancing Fred', songName: 'X', artist: 'Y' },
    { id: 'none', danceName: 'Tush Push', songName: 'Boot Scootin Boogie', artist: 'Brooks & Dunn' },
  ];
  const ids = q => searchDances(catalog, q).map(d => d.id);

  test('"fre": names starting with it, then names with a word starting with it, then names containing it, then songs, then choreographers', () => {
    expect(ids('fre')).toEqual(['freaky', 'word', 'contains', 'song', 'whitehouse']);
  });

  test('an artist beats a choreographer; a non-match is left out', () => {
    expect(ids('petty')).toEqual(['song']);
    expect(ids('whitehouse')).toEqual(['whitehouse']);
    expect(ids('zzz')).toEqual([]);
  });

  test('words spread across fields still match, after single-field matches', () => {
    const list = [
      { id: 'spread', danceName: 'Copperhead Road', artist: 'Steve Earle', difficulty: 'Beginner' },
      { id: 'name', danceName: 'Earle Beginner Shuffle' },
    ];
    expect(searchDances(list, 'earle beginner').map(d => d.id)).toEqual(['name', 'spread']);
  });

  test('a blank query keeps the order', () => {
    expect(ids('  ')).toEqual(catalog.map(d => d.id));
  });
});
