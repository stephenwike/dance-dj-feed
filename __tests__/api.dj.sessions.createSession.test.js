'use strict';
const { createSession, defaultSessionName, makeSlug } = require('../lib/server/dj/sessionLogic');

// ── Minimal MongoDB client factory ────────────────────────────────────────────
function makeMockClient() {
  const insertedDocs = [];

  const col = {
    updateMany: jest.fn(async () => ({ modifiedCount: 0 })),
    insertOne: jest.fn(async (doc) => {
      insertedDocs.push(doc);
      return { insertedId: 'new-id' };
    }),
  };

  const client = {
    db: jest.fn(() => ({
      collection: jest.fn(() => col),
    })),
    _col: col,
    _inserted: insertedDocs,
  };

  return client;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('createSession', () => {
  test('creates an active session with the given name/plugin/duration', async () => {
    const client = makeMockClient();
    const doc = await createSession(client, {
      ownerId: 'dj1', name: 'Friday Night', plugin: 'spotify', durationMinutes: 120,
    });

    expect(doc.status).toBe('active');
    expect(doc.ownerId).toBe('dj1');
    expect(doc.name).toBe('Friday Night');
    expect(doc.plugin).toBe('spotify');

    const diffMinutes = (new Date(doc.endsAt).getTime() - new Date(doc.startedAt).getTime()) / 60000;
    expect(diffMinutes).toBe(120);
  });

  test('defaults name to defaultSessionName() when omitted', async () => {
    const client = makeMockClient();
    const doc = await createSession(client, { ownerId: 'dj1', durationMinutes: 120 });
    expect(doc.name).toBe(defaultSessionName());
  });

  test('defaults plugin to "standard" when omitted', async () => {
    const client = makeMockClient();
    const doc = await createSession(client, { ownerId: 'dj1', name: 'Test', durationMinutes: 120 });
    expect(doc.plugin).toBe('standard');
  });

  test.each([undefined, null, 0, 'abc'])('defaults durationMinutes to 120 when given %p', async (durationMinutes) => {
    const client = makeMockClient();
    const doc = await createSession(client, { ownerId: 'dj1', name: 'Test', durationMinutes });
    const diffMinutes = (new Date(doc.endsAt).getTime() - new Date(doc.startedAt).getTime()) / 60000;
    expect(diffMinutes).toBe(120);
  });

  test('closes other active and draft sessions for the same ownerId before creating the new one', async () => {
    const client = makeMockClient();
    await createSession(client, { ownerId: 'dj1', name: 'Test', durationMinutes: 120 });

    expect(client._col.updateMany).toHaveBeenCalledWith(
      { status: { $in: ['active', 'draft'] }, ownerId: 'dj1' },
      { $set: { status: 'closed', closedAt: expect.any(Date) } }
    );
  });

  test('generates a slug from the session name', async () => {
    const client = makeMockClient();
    const doc = await createSession(client, { ownerId: 'dj1', name: 'Friday Night', durationMinutes: 120 });
    expect(doc.slug).toBe(makeSlug('Friday Night'));
    expect(doc.slug).toMatch(/^friday-night-/);
  });

  test('returns default session flags', async () => {
    const client = makeMockClient();
    const doc = await createSession(client, { ownerId: 'dj1', name: 'Test', durationMinutes: 120 });

    expect(doc.partnerDancesEnabled).toBe(true);
    expect(doc.weightDecayEnabled).toBe(false);
    expect(doc.weightDecayHalfLifeMinutes).toBe(60);
    expect(doc.tippingEnabled).toBe(true);
    expect(doc.closedAt).toBeNull();
    expect(doc._id).toBe('new-id');
  });
});
