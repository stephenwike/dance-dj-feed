'use strict';
const { getDanceMarks, setDanceMark, markLearned } = require('../lib/server/ldco/danceMarks');

// An in-memory stand-in for the ldco collections the marks use.
function mockClient({ dances = ['d1', 'd2'] } = {}) {
  const store = { user_favorite_dances: [], user_flagged_dances: [], user_known_dances: [], user_refresh_dances: [] };
  const dbNames = [];
  const matches = (doc, q) => Object.entries(q).every(([k, v]) => doc[k] === v);
  const collection = name => {
    if (name === 'dances') return { findOne: async q => (dances.includes(q._id) ? { _id: q._id } : null) };
    return {
      findOne: async q => store[name].find(d => matches(d, q)) ?? null,
      distinct: async (field, q) => [...new Set(store[name].filter(d => matches(d, q)).map(d => d[field]))],
      deleteMany: async q => { store[name] = store[name].filter(d => !matches(d, q)); },
      updateOne: async (q, update, opts) => {
        if (store[name].some(d => matches(d, q))) return;
        if (opts?.upsert) store[name].push({ ...q, ...update.$setOnInsert });
      },
    };
  };
  return { store, dbNames, db: name => { dbNames.push(name); return { collection }; } };
}

describe('dance marks (shared with Line Dance Manager)', () => {
  test('a favorite is stored in the manager\'s collection, in its document shape', async () => {
    const client = mockClient();
    await setDanceMark(client, 'u1', { danceId: 'd1', kind: 'favorite', on: true });
    const [doc] = client.store.user_favorite_dances;
    expect(doc).toMatchObject({ userId: 'u1', danceId: 'd1' });
    expect(typeof doc._id).toBe('string');
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(client.dbNames.every(n => n === 'ldco')).toBe(true);
  });

  test('the wishlist uses the manager\'s flagged dances', async () => {
    const client = mockClient();
    await setDanceMark(client, 'u1', { danceId: 'd2', kind: 'wishlist', on: true });
    expect(client.store.user_flagged_dances).toHaveLength(1);
    expect(await getDanceMarks(client, 'u1')).toEqual({ favorite: [], wishlist: ['d2'], known: [], refresh: [] });
  });

  test('marking twice keeps one document; unmarking removes it', async () => {
    const client = mockClient();
    await setDanceMark(client, 'u1', { danceId: 'd1', kind: 'favorite', on: true });
    await setDanceMark(client, 'u1', { danceId: 'd1', kind: 'favorite', on: true });
    expect(client.store.user_favorite_dances).toHaveLength(1);
    await setDanceMark(client, 'u1', { danceId: 'd1', kind: 'favorite', on: false });
    expect(await getDanceMarks(client, 'u1')).toEqual({ favorite: [], wishlist: [], known: [], refresh: [] });
  });

  test('marks are per user', async () => {
    const client = mockClient();
    await setDanceMark(client, 'u1', { danceId: 'd1', kind: 'favorite', on: true });
    expect((await getDanceMarks(client, 'u2')).favorite).toEqual([]);
  });

  test('only catalog dances can be marked, and the kind must be known', async () => {
    const client = mockClient();
    await expect(setDanceMark(client, 'u1', { danceId: 'nope', kind: 'favorite', on: true })).rejects.toMatchObject({ statusCode: 404 });
    await expect(setDanceMark(client, 'u1', { danceId: '', kind: 'favorite', on: true })).rejects.toMatchObject({ statusCode: 400 });
    await expect(setDanceMark(client, 'u1', { danceId: 'd1', kind: 'known', on: true })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('Learned: off the wishlist, known, and no longer refresh', async () => {
    const client = mockClient();
    await setDanceMark(client, 'u1', { danceId: 'd1', kind: 'wishlist', on: true });
    client.store.user_refresh_dances.push({ userId: 'u1', danceId: 'd1' });
    await markLearned(client, 'u1', { danceId: 'd1' });
    expect(await getDanceMarks(client, 'u1')).toEqual({ favorite: [], wishlist: [], known: ['d1'], refresh: [] });
    // Learning it again doesn't make a second "known".
    await markLearned(client, 'u1', { danceId: 'd1' });
    expect(client.store.user_known_dances).toHaveLength(1);
  });

  test("wishlisting a dance you already know marks it refresh; an unknown one doesn't", async () => {
    const client = mockClient();
    await markLearned(client, 'u1', { danceId: 'd1' });
    expect(await setDanceMark(client, 'u1', { danceId: 'd1', kind: 'wishlist', on: true })).toMatchObject({ refresh: true });
    expect((await getDanceMarks(client, 'u1')).refresh).toEqual(['d1']);
    await setDanceMark(client, 'u1', { danceId: 'd2', kind: 'wishlist', on: true });
    expect((await getDanceMarks(client, 'u1')).refresh).toEqual(['d1']);
  });

  test("known and refresh can't be toggled directly; learning needs a catalog dance", async () => {
    const client = mockClient();
    await expect(setDanceMark(client, 'u1', { danceId: 'd1', kind: 'refresh', on: true })).rejects.toMatchObject({ statusCode: 400 });
    await expect(markLearned(client, 'u1', { danceId: 'nope' })).rejects.toMatchObject({ statusCode: 404 });
  });
});
