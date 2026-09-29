'use strict';
const {
  toTrackDoc, upsertTracks, buildSearchFilter, onePerSong, toSearchResult,
} = require('../lib/server/catalog/trackCatalog');
const { fromRecording, artistCreditName } = require('../lib/server/catalog/musicbrainz');

const record = {
  source: 'musicbrainz', sourceId: 'abc', title: 'Copperhead Road (Radio Edit)', artist: 'Steve Earle',
  durationMs: 270480.4, isrcs: ['usmc18826253', 'USMC18826253'], year: 1988, rank: 12,
};

describe('toTrackDoc', () => {
  test('derives id, normalised fields, search words and variant key', () => {
    const doc = toTrackDoc(record);
    expect(doc._id).toBe('musicbrainz:abc');
    expect(doc.nTitle).toBe('copperhead road');
    expect(doc.nArtist).toBe('steve earle');
    expect(doc.words).toEqual(['copperhead', 'road', 'steve', 'earle']);
    expect(doc.variantKey).toBe('copperhead road|steve earle');
  });

  test('upper-cases and de-duplicates ISRCs, rounds duration', () => {
    const doc = toTrackDoc(record);
    expect(doc.isrcs).toEqual(['USMC18826253']);
    expect(doc.durationMs).toBe(270480);
  });

  test('defaults optional fields', () => {
    const doc = toTrackDoc({ source: 's', sourceId: '1', title: 'T', artist: 'A' });
    expect(doc).toMatchObject({ disambiguation: '', durationMs: null, isrcs: [], year: null, rank: 0 });
  });

  test('de-duplicates words shared by title and artist', () => {
    expect(toTrackDoc({ source: 's', sourceId: '1', title: 'Road Road', artist: 'Road' }).words).toEqual(['road']);
  });

  test('rejects records missing required fields', () => {
    expect(() => toTrackDoc({ source: 's', sourceId: '1', title: 'T' })).toThrow(/artist/);
    expect(() => toTrackDoc(null)).toThrow();
  });
});

describe('upsertTracks', () => {
  function fakeClient() {
    const calls = [];
    const col = { bulkWrite: jest.fn(async ops => { calls.push(ops); return { upsertedCount: ops.length, modifiedCount: 0 }; }) };
    return { client: { db: () => ({ collection: () => col }) }, calls };
  }

  test('upserts by id and adds ISRCs without replacing existing ones', async () => {
    const { client, calls } = fakeClient();
    const res = await upsertTracks(client, [record]);
    expect(res).toEqual({ upserted: 1, modified: 0 });
    const { filter, update, upsert } = calls[0][0].updateOne;
    expect(filter).toEqual({ _id: 'musicbrainz:abc' });
    expect(upsert).toBe(true);
    expect(update.$addToSet).toEqual({ isrcs: { $each: ['USMC18826253'] } });
    expect(update.$set.isrcs).toBeUndefined();
  });

  test('initialises isrcs only on insert when a record has none', async () => {
    const { client, calls } = fakeClient();
    await upsertTracks(client, [{ ...record, isrcs: [] }]);
    const { update } = calls[0][0].updateOne;
    expect(update.$addToSet).toBeUndefined();
    expect(update.$setOnInsert.isrcs).toEqual([]);
  });

  test('does nothing for an empty batch', async () => {
    const { client, calls } = fakeClient();
    expect(await upsertTracks(client, [])).toEqual({ upserted: 0, modified: 0 });
    expect(calls).toHaveLength(0);
  });
});

describe('buildSearchFilter', () => {
  test('treats the last word as a prefix', () => {
    expect(buildSearchFilter('copp')).toEqual({ words: { $regex: '^copp' } });
  });

  test('requires earlier words to match exactly', () => {
    expect(buildSearchFilter('Copperhead Ro')).toEqual({
      $and: [{ words: 'copperhead' }, { words: { $regex: '^ro' } }],
    });
  });

  test('normalises the query the same way as the stored words', () => {
    expect(buildSearchFilter('Café!')).toEqual({ words: { $regex: '^cafe' } });
  });

  test('returns null for queries that are too short or empty', () => {
    expect(buildSearchFilter('c')).toBeNull();
    expect(buildSearchFilter('  !! ')).toBeNull();
  });

  test('escapes nothing dangerous into the regex', () => {
    // normalizeText strips everything but letters/digits, so no regex syntax survives
    expect(buildSearchFilter('a.*(b')).toEqual({ $and: [{ words: 'a' }, { words: { $regex: '^b' } }] });
  });
});

describe('onePerSong', () => {
  test('keeps the first (highest-ranked) version of each song', () => {
    const docs = [
      { _id: '1', variantKey: 'a|x' }, { _id: '2', variantKey: 'a|x' },
      { _id: '3', variantKey: 'b|x' }, { _id: '4', variantKey: 'c|x' },
    ];
    expect(onePerSong(docs, 10).map(d => d._id)).toEqual(['1', '3', '4']);
    expect(onePerSong(docs, 2).map(d => d._id)).toEqual(['1', '3']);
  });
});

describe('toSearchResult', () => {
  test('exposes display fields only', () => {
    const doc = { ...toTrackDoc(record), rank: 5 };
    expect(toSearchResult(doc)).toEqual({
      id: 'musicbrainz:abc', title: 'Copperhead Road (Radio Edit)', artist: 'Steve Earle',
      disambiguation: '', durationMs: 270480, year: 1988,
    });
  });
});

describe('musicbrainz.fromRecording', () => {
  const recording = {
    id: 'mbid-1', title: 'Copperhead Road', length: 270480, disambiguation: 'live',
    'first-release-date': '1988-10-17',
    'artist-credit': [{ name: 'Steve Earle', joinphrase: ' & ' }, { name: 'The Dukes' }],
    releases: [{}, {}, {}],
    isrcs: ['USMC18826253'],
  };

  test('maps a recording to a catalog record', () => {
    expect(fromRecording(recording)).toEqual({
      source: 'musicbrainz', sourceId: 'mbid-1', title: 'Copperhead Road', artist: 'Steve Earle & The Dukes',
      disambiguation: 'live', durationMs: 270480, isrcs: ['USMC18826253'], year: 1988, rank: 3,
    });
  });

  test('tolerates missing optional fields', () => {
    const r = fromRecording({ id: 'x', title: 'T', 'artist-credit': [{ artist: { name: 'A' } }] });
    expect(r).toMatchObject({ artist: 'A', durationMs: null, isrcs: [], year: null, rank: 0, disambiguation: '' });
  });

  test('skips videos and recordings without a title or artist', () => {
    expect(fromRecording({ ...recording, video: true })).toBeNull();
    expect(fromRecording({ ...recording, title: '' })).toBeNull();
    expect(fromRecording({ ...recording, 'artist-credit': [] })).toBeNull();
  });

  test('artistCreditName joins credits with their join phrases', () => {
    expect(artistCreditName([{ name: 'A', joinphrase: ' feat. ' }, { name: 'B' }])).toBe('A feat. B');
    expect(artistCreditName(undefined)).toBe('');
  });
});
