'use strict';
const { createCatalogSearch, RECENT_TTL_MS } = require('../lib/server/catalog/catalogSearch');
const { createListenBrainzClient, rankByListens } = require('../lib/server/catalog/listenbrainzClient');
const { recordingQuery, createMusicBrainzClient, MIN_GAP_MS, PAGE_SIZE } = require('../lib/server/catalog/musicbrainzClient');

const recording = { id: 'mb1', title: 'Wagon Wheel', 'artist-credit': [{ name: 'Darius Rucker' }], length: 296000 };

// A catalog that finds tracks once they've been upserted.
function fakeStore() {
  const tracks = [];
  return {
    tracks,
    searchTracks: jest.fn(async (client, q) => tracks.filter(t => t.title.toLowerCase().includes(q.toLowerCase().split(' ')[0]))),
    upsertTracks: jest.fn(async (client, records) => { tracks.push(...records); return { upserted: records.length, modified: 0 }; }),
  };
}

describe('createCatalogSearch', () => {
  test('returns local results without asking MusicBrainz for short queries', async () => {
    const store = fakeStore();
    store.tracks.push({ title: 'Wagon Wheel' });
    const musicbrainz = { searchRecordings: jest.fn() };
    const search = createCatalogSearch({ musicbrainz, store });
    expect(await search({}, 'wagon')).toHaveLength(1);
    expect(musicbrainz.searchRecordings).not.toHaveBeenCalled();
  });

  test('refreshes specific queries in the background, returning local results at once', async () => {
    const store = fakeStore();
    store.tracks.push({ title: 'Wagonmaster' });
    let release;
    const musicbrainz = { searchRecordings: jest.fn(() => new Promise(r => { release = () => r([recording]); })) };
    const search = createCatalogSearch({ musicbrainz, store });
    const results = await search({}, 'wagon wheel'); // resolves before MusicBrainz answers
    expect(results).toEqual([{ title: 'Wagonmaster' }]);
    expect(musicbrainz.searchRecordings).toHaveBeenCalledWith(['wagon', 'wheel']);
    release();
    await new Promise(r => setImmediate(r));
    expect(store.upsertTracks).toHaveBeenCalled();
  });

  test('ranks fetched recordings by ListenBrainz listen counts', async () => {
    const store = fakeStore();
    const musicbrainz = { searchRecordings: jest.fn(async () => [recording]) };
    const listenbrainz = { listenCounts: jest.fn(async () => new Map([['mb1', 36081]])) };
    await createCatalogSearch({ musicbrainz, listenbrainz, store })({}, 'wagon wheel');
    expect(store.upsertTracks.mock.calls[0][1][0].rank).toBe(36081);
  });

  test('on a miss, fetches from MusicBrainz, adds to the catalog and searches again', async () => {
    const store = fakeStore();
    const musicbrainz = { searchRecordings: jest.fn(async () => [recording, { id: 'x', video: true, title: 'V' }]) };
    const search = createCatalogSearch({ musicbrainz, store });
    const results = await search({}, 'Wagon Wheel');
    expect(musicbrainz.searchRecordings).toHaveBeenCalledWith(['wagon', 'wheel']);
    expect(store.upsertTracks.mock.calls[0][1]).toEqual([expect.objectContaining({ sourceId: 'mb1', title: 'Wagon Wheel' })]);
    expect(results).toHaveLength(1);
  });

  test('does not re-ask about a query MusicBrainz recently answered', async () => {
    let t = 0;
    const store = fakeStore();
    const musicbrainz = { searchRecordings: jest.fn(async () => []) };
    const search = createCatalogSearch({ musicbrainz, store, now: () => t });
    await search({}, 'nothing here');
    await search({}, 'Nothing Here!');
    expect(musicbrainz.searchRecordings).toHaveBeenCalledTimes(1);
    t += RECENT_TTL_MS + 1;
    await search({}, 'nothing here');
    expect(musicbrainz.searchRecordings).toHaveBeenCalledTimes(2);
  });

  test('retries next time when a lookup was skipped (throttled/failed)', async () => {
    const store = fakeStore();
    const musicbrainz = { searchRecordings: jest.fn(async () => null) };
    const search = createCatalogSearch({ musicbrainz, store });
    expect(await search({}, 'wagon')).toEqual([]);
    await search({}, 'wagon');
    expect(musicbrainz.searchRecordings).toHaveBeenCalledTimes(2);
  });

  test('shares one MusicBrainz call between concurrent identical queries', async () => {
    const store = fakeStore();
    let release;
    const musicbrainz = { searchRecordings: jest.fn(() => new Promise(r => { release = () => r([recording]); })) };
    const search = createCatalogSearch({ musicbrainz, store });
    const a = search({}, 'wagon');
    const b = search({}, 'wagon');
    await new Promise(r => setImmediate(r));
    release();
    await Promise.all([a, b]);
    expect(musicbrainz.searchRecordings).toHaveBeenCalledTimes(1);
  });

  test('skips short queries and works without a MusicBrainz client', async () => {
    const musicbrainz = { searchRecordings: jest.fn() };
    await createCatalogSearch({ musicbrainz, store: fakeStore() })({}, 'wa');
    expect(musicbrainz.searchRecordings).not.toHaveBeenCalled();
    expect(await createCatalogSearch({ musicbrainz: null, store: fakeStore() })({}, 'wagon')).toEqual([]);
  });
});

describe('recordingQuery', () => {
  test('boosts the whole phrase and requires every word in title or artist', () => {
    expect(recordingQuery(['wagon', 'whe'])).toBe(
      'recording:"wagon whe"^5 OR ((recording:wagon OR artist:wagon) AND '
      + '(recording:whe OR artist:whe OR recording:whe* OR artist:whe*))',
    );
  });

  test('does not wildcard very short last words', () => {
    expect(recordingQuery(['a', 'by'])).toBe('recording:"a by"^5 OR ((recording:a OR artist:a) AND (recording:by OR artist:by))');
  });
});

describe('createMusicBrainzClient', () => {
  const okFetch = () => jest.fn(async () => ({ ok: true, json: async () => ({ recordings: [recording] }) }));

  test('is disabled without a contact', () => {
    expect(createMusicBrainzClient({ contact: '' })).toBeNull();
  });

  test('identifies itself and returns recordings', async () => {
    const fetchImpl = okFetch();
    const mb = createMusicBrainzClient({ contact: 'dj@example.com', fetchImpl });
    expect(await mb.searchRecordings(['wagon'])).toEqual([recording]);
    expect(fetchImpl.mock.calls[0][1].headers['User-Agent']).toBe('LineDanceDJFeed/0.1 ( dj@example.com )');
  });

  test('skips a lookup that would wait longer than maxWaitMs', async () => {
    const t = 0;
    const fetchImpl = okFetch();
    const mb = createMusicBrainzClient({ contact: 'c', fetchImpl, now: () => t, maxWaitMs: MIN_GAP_MS - 1 });
    expect(await mb.searchRecordings(['a'])).toEqual([recording]);
    expect(await mb.searchRecordings(['b'])).toBeNull(); // next slot is MIN_GAP_MS away
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('fetches a second page for songs with many versions, and stops when done', async () => {
    let t = 0;
    const page = n => Array.from({ length: n }, (_, i) => ({ ...recording, id: `r${i}` }));
    const fetchImpl = jest.fn(async url => ({
      ok: true,
      json: async () => ({ count: 150, recordings: url.includes('offset=0') ? page(PAGE_SIZE) : page(50) }),
    }));
    const mb = createMusicBrainzClient({ contact: 'c', fetchImpl, now: () => (t += 10_000) });
    expect(await mb.searchRecordings(['wagon'])).toHaveLength(150);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const single = jest.fn(async () => ({ ok: true, json: async () => ({ count: 3, recordings: page(3) }) }));
    const mb2 = createMusicBrainzClient({ contact: 'c', fetchImpl: single, now: () => (t += 10_000) });
    expect(await mb2.searchRecordings(['wagon'])).toHaveLength(3);
    expect(single).toHaveBeenCalledTimes(1);
  });

  test('keeps the first page if the second is throttled', async () => {
    const t = 0;
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => ({ ...recording, id: `r${i}` }));
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ count: 500, recordings: full }) }));
    const mb = createMusicBrainzClient({ contact: 'c', fetchImpl, now: () => t, maxWaitMs: MIN_GAP_MS - 1 });
    expect(await mb.searchRecordings(['wagon'])).toHaveLength(PAGE_SIZE);
  });

  test('returns null (never throws) on HTTP errors and network failures', async () => {
    let t = 0;
    const now = () => (t += 10_000);
    const failing = createMusicBrainzClient({ contact: 'c', now, fetchImpl: async () => ({ ok: false, status: 500 }) });
    expect(await failing.searchRecordings(['a'])).toBeNull();
    const offline = createMusicBrainzClient({ contact: 'c', now, fetchImpl: async () => { throw new Error('offline'); } });
    expect(await offline.searchRecordings(['a'])).toBeNull();
  });
});

describe('ListenBrainz', () => {
  test('listenCounts maps MBIDs to total listens', async () => {
    const fetchImpl = jest.fn(async (url, opts) => ({
      ok: true,
      json: async () => JSON.parse(opts.body).recording_mbids.map(id => ({ recording_mbid: id, total_listen_count: id === 'a' ? 10 : null })),
    }));
    const lb = createListenBrainzClient({ userAgent: 'UA', fetchImpl });
    const counts = await lb.listenCounts(['a', 'b', 'a']);
    expect(counts).toEqual(new Map([['a', 10], ['b', 0]]));
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).recording_mbids).toEqual(['a', 'b']);
  });

  test('listenCounts returns null (never throws) on failure', async () => {
    expect(await createListenBrainzClient({ fetchImpl: async () => ({ ok: false }) }).listenCounts(['a'])).toBeNull();
    expect(await createListenBrainzClient({ fetchImpl: async () => { throw new Error('x'); } }).listenCounts(['a'])).toBeNull();
  });

  test('rankByListens sets rank from counts, 0 for unknown recordings', async () => {
    const lb = { listenCounts: async () => new Map([['a', 5]]) };
    const ranked = await rankByListens(lb, [{ sourceId: 'a' }, { sourceId: 'b' }]);
    expect(ranked.map(r => r.rank)).toEqual([5, 0]);
  });

  test('rankByListens leaves rank unset when the lookup failed, so stored ranks survive', async () => {
    const ranked = await rankByListens({ listenCounts: async () => null }, [{ sourceId: 'a' }]);
    expect(ranked[0].rank).toBeUndefined();
    expect(await rankByListens(null, [{ sourceId: 'a' }])).toEqual([{ sourceId: 'a' }]);
  });
});
