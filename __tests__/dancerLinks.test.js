'use strict';
const { ObjectId } = require('mongodb');
const { backfillAttendance } = require('../lib/server/ldco/hostDancers');
const { listLinkableSessions, previewDancers, linkDancers, isPossibleAccount, seenAt } = require('../lib/server/dj/dancerLinks');

// A small in-memory MongoDB: enough of find/findOne/updateOne/insertOne for these modules.
function memoryClient(data = {}) {
  const dbs = {};
  const coll = (db, name) => {
    dbs[db] ??= {};
    dbs[db][name] ??= [];
    return dbs[db][name];
  };
  for (const [key, rows] of Object.entries(data)) {
    const [db, name] = key.split('.');
    coll(db, name).push(...rows);
  }
  const same = (a, b) => String(a) === String(b);
  const matchValue = (v, cond) => {
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !(cond instanceof ObjectId)) {
      if ('$in' in cond) return cond.$in.some(c => same(v, c));
      if ('$nin' in cond) return !cond.$nin.some(c => same(v, c));
      if ('$ne' in cond) return cond.$ne === null ? v != null : !same(v, cond.$ne);
    }
    return same(v, cond);
  };
  const matches = (doc, q) => Object.entries(q).every(([k, c]) => matchValue(doc[k], c));
  const cursor = rows => ({ sort: () => cursor(rows), toArray: async () => rows.map(r => ({ ...r })) });
  const api = (db, name) => ({
    find: q => cursor(coll(db, name).filter(d => matches(d, q))),
    findOne: async q => coll(db, name).find(d => matches(d, q)) ?? null,
    insertOne: async doc => { coll(db, name).push({ ...doc }); return { insertedId: doc._id }; },
    updateOne: async (q, u, { upsert } = {}) => {
      let doc = coll(db, name).find(d => matches(d, q));
      let upsertedCount = 0;
      if (!doc && upsert) { doc = { ...q, ...u.$setOnInsert }; coll(db, name).push(doc); upsertedCount = 1; }
      if (!doc) return { upsertedCount };
      Object.assign(doc, u.$set);
      for (const [k, v] of Object.entries(u.$min ?? {})) if (doc[k] == null || v < doc[k]) doc[k] = v;
      for (const [k, v] of Object.entries(u.$max ?? {})) if (doc[k] == null || v > doc[k]) doc[k] = v;
      for (const [k, v] of Object.entries(u.$inc ?? {})) doc[k] = (doc[k] ?? 0) + v;
      return { upsertedCount };
    },
  });
  return { rows: (db, name) => coll(db, name), db: name => ({ collection: c => api(name, c) }) };
}

const day = d => new Date(Date.UTC(2026, 8, d, 19, 0));
const S1 = new ObjectId(); // older event
const S2 = new ObjectId(); // newer event
const OTHER = new ObjectId(); // another host's event

function fixture() {
  return memoryClient({
    'djfeed.dj_sessions': [
      { _id: S1, ownerId: 'host', status: 'closed', name: 'September Social', startedAt: day(10) },
      { _id: S2, ownerId: 'host', status: 'closed', name: 'Fall Kickoff', startedAt: day(24) },
      { _id: OTHER, ownerId: 'someone-else', status: 'closed', name: 'Not Yours', startedAt: day(12) },
    ],
    'djfeed.requester_history': [
      { sessionId: String(S1), ownerId: 'host', clientId: 'pat', requesterName: 'Pat', sessionDate: day(10), requests: [{ createdAt: new Date(day(10).getTime() + 3600e3) }, { createdAt: day(10) }] },
      { sessionId: String(S1), ownerId: 'host', clientId: 'anon_abc', requesterName: 'User_123', sessionDate: day(10), requests: [] },
      { sessionId: String(S2), ownerId: 'host', clientId: 'pat', requesterName: 'Pat', sessionDate: day(24), requests: [] },
      { sessionId: String(S2), ownerId: 'host', clientId: 'sam', requesterName: 'Sam', sessionDate: day(24), requests: [] },
      { sessionId: String(S2), ownerId: 'host', clientId: 'host', requesterName: 'Me', sessionDate: day(24), requests: [] },
      { sessionId: String(OTHER), ownerId: 'someone-else', clientId: 'pat', sessionDate: day(12), requests: [] },
    ],
    'ldco.users': [
      { _id: 'pat', name: 'Pat Doe', email: 'pat@example.com' },
      { _id: 'sam', name: 'Sam Roe', email: 'sam@example.com' },
      { _id: 'host', name: 'The Host', email: 'host@example.com' },
    ],
  });
}

describe('backfilling an attendance', () => {
  test('dates only widen, each event counts once, and running it twice changes nothing', async () => {
    const client = memoryClient();
    await backfillAttendance(client, { hostId: 'host', sessionId: 's2', userId: 'pat', seenAt: day(24) });
    expect(await backfillAttendance(client, { hostId: 'host', sessionId: 's1', userId: 'pat', seenAt: day(10) })).toEqual({ newVisit: true, newLink: false });
    await backfillAttendance(client, { hostId: 'host', sessionId: 's1', userId: 'pat', seenAt: day(10) });
    const [link] = client.rows('ldco', 'host_dancers');
    expect(link).toMatchObject({ firstSeenAt: day(10), lastSeenAt: day(24), lastSessionId: 's2', sessionCount: 2 });
    expect(client.rows('ldco', 'session_attendance')).toHaveLength(2);
  });
});

describe('Link past dancers', () => {
  test('lists only your own past events, with signed-in dancers vs guests', async () => {
    const sessions = await listLinkableSessions(fixture(), 'host');
    expect(sessions.map(s => s.name).sort()).toEqual(['Fall Kickoff', 'September Social']);
    const byName = Object.fromEntries(sessions.map(s => [s.name, s]));
    expect(byName['September Social']).toMatchObject({ dancers: 1, guests: 1, linked: 0 });
    expect(byName['Fall Kickoff']).toMatchObject({ dancers: 2, guests: 0 }); // pat and sam — not the host's own requests
    expect(sessions.some(s => s.name === 'Not Yours')).toBe(false);
  });

  test('previews the signed-in dancers (not guests, not yourself), most events first', async () => {
    const { dancers, guests } = await previewDancers(fixture(), 'host', [String(S1), String(S2)]);
    expect(guests).toBe(1);
    expect(dancers.map(d => d.userId)).toEqual(['pat', 'sam']);
    expect(dancers[0]).toMatchObject({ name: 'Pat Doe', email: 'pat@example.com', linked: false });
    expect(dancers[0].sessions.map(s => s.name)).toEqual(['Fall Kickoff', 'September Social']);
  });

  test('another host\'s event is ignored even if asked for', async () => {
    expect((await previewDancers(fixture(), 'host', [String(OTHER)])).dancers).toEqual([]);
  });

  test('links the chosen dancers, dated to when they were there', async () => {
    const client = fixture();
    const result = await linkDancers(client, 'host', { sessionIds: [String(S1), String(S2)], userIds: ['pat'] });
    expect(result).toEqual({ dancers: 1, newLinks: 1, events: 2 });
    const [link] = client.rows('ldco', 'host_dancers');
    // First seen at Pat's earliest request at the older event; last seen at the newer event.
    expect(link).toMatchObject({ hostId: 'host', userId: 'pat', firstSeenAt: day(10), lastSeenAt: day(24), sessionCount: 2, lastSessionId: String(S2) });
    expect(client.rows('ldco', 'session_attendance').map(a => a.sessionId).sort()).toEqual([String(S1), String(S2)].sort());

    // Again: already linked, nothing new.
    expect(await linkDancers(client, 'host', { sessionIds: [String(S1), String(S2)], userIds: ['pat'] })).toEqual({ dancers: 1, newLinks: 0, events: 2 });
    expect(client.rows('ldco', 'host_dancers')[0].sessionCount).toBe(2);
    expect((await previewDancers(client, 'host', [String(S2)])).dancers.find(d => d.userId === 'pat').linked).toBe(true);
  });

  test('never links guests, yourself, or from someone else\'s event', async () => {
    const client = fixture();
    const result = await linkDancers(client, 'host', { sessionIds: [String(S1), String(S2), String(OTHER)], userIds: ['anon_abc', 'host', 'pat'] });
    expect(result.dancers).toBe(1);
    expect(client.rows('ldco', 'host_dancers').map(l => l.userId)).toEqual(['pat']);
    expect(client.rows('ldco', 'session_attendance').every(a => a.hostId === 'host')).toBe(true);
  });

  test('helpers: which ids can be accounts, and when a dancer was seen', () => {
    expect(isPossibleAccount('66919a36bfcd4d848099f2ba')).toBe(true);
    expect(isPossibleAccount('anon_123')).toBe(false);
    expect(isPossibleAccount('dj')).toBe(false);
    expect(seenAt({ sessionDate: day(3), requests: [] })).toEqual(day(3));
  });
});
