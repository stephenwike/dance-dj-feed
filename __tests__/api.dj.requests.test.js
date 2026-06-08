'use strict';
const { createRequest } = require('../lib/server/dj/requestLogic');

// ── Minimal MongoDB client factory ────────────────────────────────────────────
function makeMockClient({ session = { _id: 'sess1', status: 'active' }, existing = [] } = {}) {
  const insertedDocs = [];

  function makeCol(docs) {
    return {
      findOne: jest.fn(async (filter) => matchOne(docs, filter)),
      find: jest.fn((filter) => ({
        sort: jest.fn().mockReturnThis(),
        project: jest.fn().mockReturnThis(),
        toArray: jest.fn(async () => matchMany(docs, filter)),
      })),
      insertOne: jest.fn(async (doc) => {
        insertedDocs.push(doc);
        return { insertedId: 'new-id' };
      }),
    };
  }

  const client = {
    db: jest.fn(() => ({
      collection: jest.fn((colName) => {
        if (colName === 'dj_sessions') return makeCol(session ? [session] : []);
        if (colName === 'dj_requests') return makeCol(existing);
        return makeCol([]);
      }),
    })),
    _inserted: insertedDocs,
  };

  return client;
}

function matchOne(docs, filter) {
  return docs.find(doc => matches(doc, filter)) ?? null;
}
function matchMany(docs, filter) {
  return docs.filter(doc => matches(doc, filter));
}
function matches(doc, filter) {
  return Object.entries(filter).every(([k, v]) => {
    if (v === null || v === undefined) return doc[k] == null;
    if (typeof v === 'object' && '$in' in v) return v.$in.includes(doc[k]);
    if (typeof v === 'object' && '$regex' in v) return v.$regex.test(doc[k]);
    return doc[k] === v;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('createRequest — duplicate queue prevention', () => {
  test('creates a pending request when dance is not yet in the queue', async () => {
    const client = makeMockClient({ existing: [] });
    const doc = await createRequest(client, { danceName: 'Waterfall' });
    expect(doc.status).toBe('pending');
  });

  test('creates a PENDING request even when the same dance is already approved', async () => {
    const client = makeMockClient({
      existing: [
        { _id: 'r1', sessionId: 'sess1', danceName: 'Waterfall', status: 'approved', queuePosition: 1 },
      ],
    });
    const doc = await createRequest(client, { danceName: 'Waterfall' });
    expect(doc.status).toBe('pending');  // was 'approved' before the fix
  });

  test('does not assign the same queuePosition as the existing approved entry', async () => {
    const client = makeMockClient({
      existing: [
        { _id: 'r1', sessionId: 'sess1', danceName: 'Waterfall', status: 'approved', queuePosition: 1 },
      ],
    });
    const doc = await createRequest(client, { danceName: 'Waterfall' });
    expect(doc.queuePosition).not.toBe(1);  // was 1 before the fix (same as existing)
  });

  test('creates a pending request when the same dance is currently playing', async () => {
    const client = makeMockClient({
      existing: [
        { _id: 'r1', sessionId: 'sess1', danceName: 'Waterfall', status: 'playing', queuePosition: 1 },
      ],
    });
    const doc = await createRequest(client, { danceName: 'Waterfall' });
    expect(doc.status).toBe('pending');
  });

  test('marks isRepeat=true when dance was played earlier in the session', async () => {
    const client = makeMockClient({
      existing: [
        { _id: 'r1', sessionId: 'sess1', danceName: 'Waterfall', status: 'played', updatedAt: new Date() },
      ],
    });
    const doc = await createRequest(client, { danceName: 'Waterfall' });
    expect(doc.isRepeat).toBe(true);
  });

  test('marks isRepeat=false for a dance never played in the session', async () => {
    const client = makeMockClient({ existing: [] });
    const doc = await createRequest(client, { danceName: 'Waterfall' });
    expect(doc.isRepeat).toBe(false);
  });

  test('throws 400 when danceName is missing', async () => {
    const client = makeMockClient();
    await expect(createRequest(client, {})).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── Song swap ─────────────────────────────────────────────────────────────
  test('stores isSongSwap and swap song details when provided', async () => {
    const client = makeMockClient({ existing: [] });
    const doc = await createRequest(client, {
      danceName: 'Electric Slide',
      isSongSwap: true,
      swapSongName: 'Boots On',
      swapArtist: 'Randy Houser',
    });
    expect(doc.isSongSwap).toBe(true);
    expect(doc.swapSongName).toBe('Boots On');
    expect(doc.swapArtist).toBe('Randy Houser');
  });

  test('defaults isSongSwap to false when not provided', async () => {
    const client = makeMockClient({ existing: [] });
    const doc = await createRequest(client, { danceName: 'Electric Slide' });
    expect(doc.isSongSwap).toBe(false);
  });

  test('respects forced status when caller passes status explicitly (DJ-added tracks)', async () => {
    const client = makeMockClient({ existing: [] });
    const doc = await createRequest(client, { danceName: 'Waterfall', status: 'approved', queuePosition: 1 });
    expect(doc.status).toBe('approved');
    expect(doc.queuePosition).toBe(1);
  });
});
