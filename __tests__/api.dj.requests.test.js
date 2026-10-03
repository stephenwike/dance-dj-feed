'use strict';
const { createRequest, listRequests, toLocalTrackKey, toPlayLengthMs } = require('../lib/server/dj/requestLogic');

const SESSION = { _id: 'sess1', status: 'active', ownerId: 'dj1' };

// ── Minimal MongoDB client factory ────────────────────────────────────────────
function makeMockClient({ session = { _id: 'sess1', status: 'active' }, existing = [], tracks = [], dances = [] } = {}) {
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
        if (colName === 'tracks') return makeCol(tracks);
        if (colName === 'dances') return makeCol(dances);
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
    if (typeof v === 'object' && '$ne' in v) return doc[k] !== v.$ne;
    if (typeof v === 'object' && '$regex' in v) return v.$regex.test(doc[k]);
    return doc[k] === v;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('createRequest — duplicate queue prevention', () => {
  test('creates a pending request when dance is not yet in the queue', async () => {
    const client = makeMockClient({ existing: [] });
    const doc = await createRequest(client, SESSION, { danceName: 'Waterfall' });
    expect(doc.status).toBe('pending');
  });

  test('creates a PENDING request even when the same dance is already approved', async () => {
    const client = makeMockClient({
      existing: [
        { _id: 'r1', sessionId: 'sess1', danceName: 'Waterfall', status: 'approved', queuePosition: 1 },
      ],
    });
    const doc = await createRequest(client, SESSION, { danceName: 'Waterfall' });
    expect(doc.status).toBe('pending');  // was 'approved' before the fix
  });

  test('does not assign the same queuePosition as the existing approved entry', async () => {
    const client = makeMockClient({
      existing: [
        { _id: 'r1', sessionId: 'sess1', danceName: 'Waterfall', status: 'approved', queuePosition: 1 },
      ],
    });
    const doc = await createRequest(client, SESSION, { danceName: 'Waterfall' });
    expect(doc.queuePosition).not.toBe(1);  // was 1 before the fix (same as existing)
  });

  test('creates a pending request when the same dance is currently playing', async () => {
    const client = makeMockClient({
      existing: [
        { _id: 'r1', sessionId: 'sess1', danceName: 'Waterfall', status: 'playing', queuePosition: 1 },
      ],
    });
    const doc = await createRequest(client, SESSION, { danceName: 'Waterfall' });
    expect(doc.status).toBe('pending');
  });

  test('marks isRepeat=true when dance was played earlier in the session', async () => {
    const client = makeMockClient({
      existing: [
        { _id: 'r1', sessionId: 'sess1', danceName: 'Waterfall', status: 'played', updatedAt: new Date() },
      ],
    });
    const doc = await createRequest(client, SESSION, { danceName: 'Waterfall' });
    expect(doc.isRepeat).toBe(true);
  });

  test('marks isRepeat=false for a dance never played in the session', async () => {
    const client = makeMockClient({ existing: [] });
    const doc = await createRequest(client, SESSION, { danceName: 'Waterfall' });
    expect(doc.isRepeat).toBe(false);
  });

  test('throws 400 when danceName is missing', async () => {
    const client = makeMockClient();
    await expect(createRequest(client, SESSION, {})).rejects.toMatchObject({ statusCode: 400 });
  });

  test("throws 404 when no session is given (never falls back to another DJ's session)", async () => {
    const client = makeMockClient();
    await expect(createRequest(client, null, { danceName: 'Waterfall' })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('stamps the session id and owner on the new request', async () => {
    const client = makeMockClient();
    const doc = await createRequest(client, SESSION, { danceName: 'Waterfall' });
    expect(doc.sessionId).toBe('sess1');
    expect(doc.ownerId).toBe('dj1');
  });

  // ── Song swap ─────────────────────────────────────────────────────────────
  test('stores isSongSwap and swap song details when provided', async () => {
    const client = makeMockClient({ existing: [] });
    const doc = await createRequest(client, SESSION, {
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
    const doc = await createRequest(client, SESSION, { danceName: 'Electric Slide' });
    expect(doc.isSongSwap).toBe(false);
  });

  test('respects forced status when caller passes status explicitly (DJ-added tracks)', async () => {
    const client = makeMockClient({ existing: [] });
    const doc = await createRequest(client, SESSION, { danceName: 'Waterfall', status: 'approved', queuePosition: 1 });
    expect(doc.status).toBe('approved');
    expect(doc.queuePosition).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('createRequest — deduplication', () => {
  test('returns existing request when same user already has a pending request for the same dance', async () => {
    const existing = [
      { _id: 'existing-id', sessionId: 'sess1', clientId: 'User_123', danceName: 'Waterfall',
        status: 'pending', isSongSwap: false, queuePosition: 1 },
    ];
    const client = makeMockClient({ existing });
    const doc = await createRequest(client, SESSION, { danceName: 'Waterfall', clientId: 'User_123' });
    expect(doc._id).toBe('existing-id');
    expect(client._inserted.length).toBe(0);
  });

  test('creates a new request when the existing one belongs to a different user', async () => {
    const existing = [
      { _id: 'existing-id', sessionId: 'sess1', clientId: 'User_456', danceName: 'Waterfall',
        status: 'pending', isSongSwap: false, queuePosition: 1 },
    ];
    const client = makeMockClient({ existing });
    const doc = await createRequest(client, SESSION, { danceName: 'Waterfall', clientId: 'User_123' });
    expect(doc._id).not.toBe('existing-id');
    expect(client._inserted.length).toBe(1);
  });

  test('creates a new request when the existing one is played (not active)', async () => {
    const existing = [
      { _id: 'existing-id', sessionId: 'sess1', clientId: 'User_123', danceName: 'Waterfall',
        status: 'played', isSongSwap: false },
    ];
    const client = makeMockClient({ existing });
    const doc = await createRequest(client, SESSION, { danceName: 'Waterfall', clientId: 'User_123' });
    expect(doc._id).not.toBe('existing-id');
    expect(client._inserted.length).toBe(1);
  });

  test('returns existing swap request when same user already has a pending swap for the same song', async () => {
    const existing = [
      { _id: 'swap-id', sessionId: 'sess1', clientId: 'User_123', danceName: 'Electric Slide',
        status: 'pending', isSongSwap: true, swapSongName: 'Boots On' },
    ];
    const client = makeMockClient({ existing });
    const doc = await createRequest(client, SESSION, {
      danceName: 'Electric Slide', clientId: 'User_123',
      isSongSwap: true, swapSongName: 'Boots On',
    });
    expect(doc._id).toBe('swap-id');
    expect(client._inserted.length).toBe(0);
  });

  test('creates a new swap request when swap song differs', async () => {
    const existing = [
      { _id: 'swap-id', sessionId: 'sess1', clientId: 'User_123', danceName: 'Electric Slide',
        status: 'pending', isSongSwap: true, swapSongName: 'Boots On' },
    ];
    const client = makeMockClient({ existing });
    const doc = await createRequest(client, SESSION, {
      danceName: 'Electric Slide', clientId: 'User_123',
      isSongSwap: true, swapSongName: 'Different Song',
    });
    expect(doc._id).not.toBe('swap-id');
    expect(client._inserted.length).toBe(1);
  });

  test('skips dedup for DJ-direct-add (forcedStatus set)', async () => {
    const existing = [
      { _id: 'existing-id', sessionId: 'sess1', clientId: 'dj', danceName: 'Waterfall',
        status: 'approved', isSongSwap: false, queuePosition: 1 },
    ];
    const client = makeMockClient({ existing });
    const doc = await createRequest(client, SESSION, {
      danceName: 'Waterfall', clientId: 'dj', status: 'approved', queuePosition: 2,
    });
    expect(doc._id).not.toBe('existing-id');
    expect(client._inserted.length).toBe(1);
  });
});

describe('createRequest — local files', () => {
  test('stores the localTrackKey a DJ adds from their music folder', async () => {
    const client = makeMockClient();
    const doc = await createRequest(client, SESSION, {
      danceName: 'Wagon Wheel', clientId: 'dj', status: 'approved', localTrackKey: 'Country/Wagon Wheel.mp3',
    });
    expect(doc.localTrackKey).toBe('Country/Wagon Wheel.mp3');
  });

  test('defaults localTrackKey to null', async () => {
    const doc = await createRequest(makeMockClient(), SESSION, { danceName: 'Waterfall' });
    expect(doc.localTrackKey).toBeNull();
  });
});

describe('toLocalTrackKey', () => {
  test('keeps non-empty strings up to 1024 characters', () => {
    expect(toLocalTrackKey('a/b.mp3')).toBe('a/b.mp3');
    expect(toLocalTrackKey('x'.repeat(1024))).toHaveLength(1024);
  });

  test('rejects empty, oversized and non-string values', () => {
    expect(toLocalTrackKey('')).toBeNull();
    expect(toLocalTrackKey('x'.repeat(1025))).toBeNull();
    expect(toLocalTrackKey(42)).toBeNull();
    expect(toLocalTrackKey({ $ne: null })).toBeNull();
    expect(toLocalTrackKey(undefined)).toBeNull();
  });
});

describe('listRequests — tempo', () => {
  test('serves wall-clock durations for requests played at a different tempo', async () => {
    const client = makeMockClient({ existing: [
      { _id: 'slow', sessionId: 'sess1', danceName: 'A', duration_ms: 180_000, tempo: 0.9 },
      { _id: 'normal', sessionId: 'sess1', danceName: 'B', duration_ms: 180_000 },
    ] });
    const byId = Object.fromEntries((await listRequests(client, 'sess1')).map(r => [r._id, r]));
    expect(byId.slow.duration_ms).toBe(200_000);
    expect(byId.normal.duration_ms).toBe(180_000);
  });
});

describe('createRequest — music catalog', () => {
  const track = {
    _id: 'musicbrainz:mb1', title: 'Wagon Wheel', artist: 'Darius Rucker',
    durationMs: 296000, isrcs: ['USUM71300001'],
  };

  test('copies title, artist, length and ISRCs from the picked catalog track', async () => {
    const client = makeMockClient({ tracks: [track] });
    const doc = await createRequest(client, SESSION, {
      danceName: 'Partner Dance', danceType: 'partner', clientId: 'anon_1',
      catalogTrackId: 'musicbrainz:mb1', songName: 'wagon wheel', artist: 'darius',
    });
    expect(doc).toMatchObject({
      catalogTrackId: 'musicbrainz:mb1', songName: 'Wagon Wheel', artist: 'Darius Rucker',
      duration_ms: 296000, isrcs: ['USUM71300001'],
    });
  });

  test('keeps an explicit duration over the catalog one', async () => {
    const client = makeMockClient({ tracks: [track] });
    const doc = await createRequest(client, SESSION, { danceName: 'X', catalogTrackId: 'musicbrainz:mb1', duration_ms: 1000 });
    expect(doc.duration_ms).toBe(1000);
  });

  test('ignores unknown or malformed catalog ids and keeps the typed song', async () => {
    const client = makeMockClient({ tracks: [track] });
    const unknown = await createRequest(client, SESSION, { danceName: 'X', catalogTrackId: 'musicbrainz:nope', songName: 'Typed' });
    expect(unknown).toMatchObject({ catalogTrackId: null, isrcs: [], songName: 'Typed' });
    const bogus = await createRequest(client, SESSION, { danceName: 'Y', catalogTrackId: { $ne: null } });
    expect(bogus.catalogTrackId).toBeNull();
  });
});

describe('listRequests — catalog dance details', () => {
  const dances = [{ _id: 'd1', primaryTrack: 't1' }];
  const tracks = [{ _id: 't1', duration_ms: 200_000, uri: 'spotify:track:orig', isrc: 'usmc18826253' }];

  test("adds the dance's song length, Spotify URI and ISRC", async () => {
    const client = makeMockClient({ dances, tracks, existing: [{ _id: 'r1', sessionId: 'sess1', danceId: 'd1', danceName: 'A' }] });
    const [r] = await listRequests(client, 'sess1');
    expect(r).toMatchObject({ duration_ms: 200_000, spotifyUri: 'spotify:track:orig', isrcs: ['USMC18826253'] });
  });

  test("a song swap keeps its own song details, not the dance's usual song", async () => {
    const client = makeMockClient({ dances, tracks, existing: [{
      _id: 'r1', sessionId: 'sess1', danceId: 'd1', danceName: 'A', isSongSwap: true, duration_ms: 150_000, isrcs: ['SWAP00000001'],
    }] });
    const [r] = await listRequests(client, 'sess1');
    expect(r).toMatchObject({ duration_ms: 150_000, spotifyUri: null, isrcs: ['SWAP00000001'] });
  });

  test('keeps ISRCs copied from the music catalog', async () => {
    const client = makeMockClient({ dances, tracks, existing: [{ _id: 'r1', sessionId: 'sess1', danceId: 'd1', danceName: 'A', isrcs: ['CATALOG00001'] }] });
    const [r] = await listRequests(client, 'sess1');
    expect(r.isrcs).toEqual(['CATALOG00001']);
  });
});

describe("play length from the DJ's player", () => {
  const dances = [{ _id: 'd1', primaryTrack: 't1' }];
  const tracks = [{ _id: 't1', duration_ms: 200_000 }];

  test("wins over the catalog song's length, and still scales with tempo", async () => {
    const client = makeMockClient({ dances, tracks, existing: [
      { _id: 'r1', sessionId: 'sess1', danceId: 'd1', danceName: 'A', playLengthMs: 150_000 },
      { _id: 'r2', sessionId: 'sess1', danceId: 'd1', danceName: 'B', playLengthMs: 150_000, tempo: 0.75 },
    ] });
    const byId = Object.fromEntries((await listRequests(client, 'sess1')).map(r => [r._id, r]));
    expect(byId.r1.duration_ms).toBe(150_000);
    expect(byId.r2.duration_ms).toBe(200_000);
  });

  test('toPlayLengthMs keeps 1s–1h and rejects the rest', () => {
    expect(toPlayLengthMs(145_000.4)).toBe(145_000);
    expect(toPlayLengthMs(500)).toBeNull();
    expect(toPlayLengthMs(2 * 60 * 60 * 1000)).toBeNull();
    expect(toPlayLengthMs(null)).toBeNull();
    expect(toPlayLengthMs('x')).toBeNull();
  });
});
