'use strict';
const { recordAttendance } = require('../lib/server/ldco/hostDancers');

// In-memory session_attendance / host_dancers supporting the upsert operators used.
function mockClient() {
  const store = { session_attendance: [], host_dancers: [] };
  const dbNames = new Set();
  const matches = (doc, q) => Object.entries(q).every(([k, v]) => doc[k] === v);
  const collection = name => ({
    updateOne: async (q, update, { upsert } = {}) => {
      let doc = store[name].find(d => matches(d, q));
      let upsertedCount = 0;
      if (!doc && upsert) {
        doc = { ...q, ...update.$setOnInsert };
        store[name].push(doc);
        upsertedCount = 1;
      }
      if (doc) {
        Object.assign(doc, update.$set);
        for (const [k, by] of Object.entries(update.$inc ?? {})) doc[k] = (doc[k] ?? 0) + by;
      }
      return { upsertedCount };
    },
  });
  return { store, dbNames, db: n => { dbNames.add(n); return { collection }; } };
}

const t = mins => new Date(Date.UTC(2026, 9, 6, 19, mins));
const event1 = { _id: 's1', ownerId: 'host' };
const event2 = { _id: 's2', ownerId: 'host' };

describe('host ↔ dancer links (shared with Line Dance Manager)', () => {
  test('opening a host\'s live event links the dancer to the host, in ldco', async () => {
    const client = mockClient();
    expect(await recordAttendance(client, { session: event1, userId: 'pat', now: t(0) })).toEqual({ recorded: true, firstVisit: true });
    expect(client.store.session_attendance).toEqual([
      expect.objectContaining({ sessionId: 's1', hostId: 'host', userId: 'pat', firstSeenAt: t(0), lastSeenAt: t(0) }),
    ]);
    expect(client.store.host_dancers).toEqual([
      expect.objectContaining({ hostId: 'host', userId: 'pat', firstSeenAt: t(0), lastSeenAt: t(0), sessionCount: 1, lastSessionId: 's1' }),
    ]);
    expect(typeof client.store.host_dancers[0]._id).toBe('string');
    expect([...client.dbNames]).toEqual(['ldco']);
  });

  test('reloading the page only moves lastSeenAt; each event counts once', async () => {
    const client = mockClient();
    await recordAttendance(client, { session: event1, userId: 'pat', now: t(0) });
    expect(await recordAttendance(client, { session: event1, userId: 'pat', now: t(30) })).toEqual({ recorded: true, firstVisit: false });
    await recordAttendance(client, { session: event2, userId: 'pat', now: t(90) });
    expect(client.store.session_attendance).toHaveLength(2);
    expect(client.store.host_dancers).toHaveLength(1);
    expect(client.store.host_dancers[0]).toMatchObject({ firstSeenAt: t(0), lastSeenAt: t(90), sessionCount: 2, lastSessionId: 's2' });
  });

  test('each host keeps their own link to the same dancer', async () => {
    const client = mockClient();
    await recordAttendance(client, { session: event1, userId: 'pat' });
    await recordAttendance(client, { session: { _id: 's9', ownerId: 'other-host' }, userId: 'pat' });
    expect(client.store.host_dancers.map(d => d.hostId).sort()).toEqual(['host', 'other-host']);
  });

  test('a host opening their own event, or no user, records nothing', async () => {
    const client = mockClient();
    expect(await recordAttendance(client, { session: event1, userId: 'host' })).toEqual({ recorded: false });
    expect(await recordAttendance(client, { session: event1, userId: null })).toEqual({ recorded: false });
    expect(client.store.session_attendance).toHaveLength(0);
  });
});
