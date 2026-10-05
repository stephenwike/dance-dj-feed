'use strict';
const { getFavoriteSongs, setFavoriteSong, COLLECTION } = require('../lib/server/dancer/favoriteSongs');

const TRACK = 'musicbrainz:4bfd58be-3246-415a-9b14-93ce7e669653';

// In-memory stand-ins for djfeed.dancer_favorite_songs and music_catalog.tracks.
function mockClient({ tracks = [TRACK] } = {}) {
  const docs = [];
  const used = [];
  const matches = (doc, q) => Object.entries(q).every(([k, v]) => doc[k] === v);
  const favorites = {
    distinct: async (field, q) => [...new Set(docs.filter(d => matches(d, q)).map(d => d[field]))],
    deleteMany: async q => { for (let i = docs.length - 1; i >= 0; i--) if (matches(docs[i], q)) docs.splice(i, 1); },
    updateOne: async (q, update, opts) => {
      if (!docs.some(d => matches(d, q)) && opts?.upsert) docs.push({ ...q, ...update.$setOnInsert });
    },
  };
  const catalog = { findOne: async q => (tracks.includes(q._id) ? { _id: q._id, title: 'Once You Love' } : null) };
  return {
    docs,
    used,
    db: dbName => ({
      collection: name => { used.push(`${dbName}.${name}`); return name === 'tracks' ? catalog : favorites; },
    }),
  };
}

describe('favorite songs (partner dances)', () => {
  test('a favorite is one document keyed by the music catalog id, in this app\'s database', async () => {
    const client = mockClient();
    await setFavoriteSong(client, 'u1', { trackId: TRACK, on: true });
    expect(client.docs).toHaveLength(1);
    expect(client.docs[0]).toMatchObject({ userId: 'u1', trackId: TRACK });
    expect(typeof client.docs[0]._id).toBe('string');
    expect(client.docs[0].createdAt).toBeInstanceOf(Date);
    expect(client.used).toContain(`djfeed.${COLLECTION}`);
    expect(client.used.some(u => u.startsWith('ldco.'))).toBe(false);
  });

  test('favoriting twice keeps one; unfavoriting removes it; per user', async () => {
    const client = mockClient();
    await setFavoriteSong(client, 'u1', { trackId: TRACK, on: true });
    await setFavoriteSong(client, 'u1', { trackId: TRACK, on: true });
    expect(await getFavoriteSongs(client, 'u1')).toEqual([TRACK]);
    expect(await getFavoriteSongs(client, 'u2')).toEqual([]);
    await setFavoriteSong(client, 'u1', { trackId: TRACK, on: false });
    expect(await getFavoriteSongs(client, 'u1')).toEqual([]);
  });

  test('only songs in the music catalog can be favorited', async () => {
    const client = mockClient();
    await expect(setFavoriteSong(client, 'u1', { trackId: 'musicbrainz:nope', on: true })).rejects.toMatchObject({ statusCode: 404 });
    await expect(setFavoriteSong(client, 'u1', { trackId: '', on: true })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('favorite song details', () => {
  const { getFavoriteSongDetails } = require('../lib/server/dancer/favoriteSongs');

  function clientWith(favorites, tracks) {
    const cursor = rows => ({ sort: () => cursor(rows), toArray: async () => rows });
    return {
      db: () => ({
        collection: name => ({
          find: (q) => (name === 'tracks'
            ? cursor(tracks.filter(t => q._id.$in.includes(t._id)))
            : cursor(favorites.filter(f => f.userId === q.userId))),
        }),
      }),
    };
  }

  test('returns title and artist for each favorite, in favorite order, skipping songs no longer in the catalog', async () => {
    const client = clientWith(
      [{ userId: 'u1', trackId: 'mb:2' }, { userId: 'u1', trackId: 'mb:gone' }, { userId: 'u1', trackId: 'mb:1' }],
      [{ _id: 'mb:1', title: 'Once You Love', artist: 'Steve Earle' }, { _id: 'mb:2', title: 'Neon Moon', artist: 'Brooks & Dunn', durationMs: 263000 }],
    );
    expect(await getFavoriteSongDetails(client, 'u1')).toEqual([
      { id: 'mb:2', title: 'Neon Moon', artist: 'Brooks & Dunn', durationMs: 263000 },
      { id: 'mb:1', title: 'Once You Love', artist: 'Steve Earle', durationMs: null },
    ]);
  });

  test('no favorites → empty, without touching the catalog', async () => {
    expect(await getFavoriteSongDetails(clientWith([], []), 'u1')).toEqual([]);
  });
});
