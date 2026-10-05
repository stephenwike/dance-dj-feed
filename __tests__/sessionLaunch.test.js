'use strict';
const { createSession, createDraftSession, activateDraftSession, addSessionAddOn } = require('../lib/server/dj/sessionLogic');
const { resolveLaunch } = require('../lib/server/dj/launchRequest');

const DRAFT_ID = '64b7f0c2a1b2c3d4e5f60718';
const tiersByMinutes = {
  120: { minutes: 120, label: '2 hrs', priceCents: 200, walletPriceCents: 164 },
  300: { minutes: 300, label: '5 hrs', priceCents: 400, walletPriceCents: 358 },
};
const plugins = ['standard', 'spotify', 'local-files'];

// A dj_sessions collection holding at most one draft.
function mockClient(draft = null) {
  const col = {
    findOne: jest.fn(async () => draft),
    insertOne: jest.fn(async () => ({ insertedId: 'new-id' })),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
    findOneAndUpdate: jest.fn(async (_filter, update) => ({ _id: DRAFT_ID, ...update.$set, addOns: [update.$addToSet.addOns] })),
  };
  return { db: () => ({ collection: () => col }), col };
}

describe('session music sources', () => {
  test('a session started with a paid source owns it; an included one adds nothing', async () => {
    expect((await createSession(mockClient(), { ownerId: 'dj1', plugin: 'spotify' })).addOns).toEqual(['spotify']);
    expect((await createSession(mockClient(), { ownerId: 'dj1', plugin: 'local-files' })).addOns).toEqual([]);
  });

  test('a draft remembers its music source but owns nothing until it launches', async () => {
    const client = mockClient();
    const draft = await createDraftSession(client, { ownerId: 'dj1', name: 'Friday', durationMinutes: 120, plugin: 'spotify' });
    expect(draft).toMatchObject({ status: 'draft', plugin: 'spotify', addOns: [] });
  });

  test('launching a draft uses its music source and records the add-on', async () => {
    const client = mockClient({ _id: DRAFT_ID, ownerId: 'dj1', status: 'draft', plugin: 'spotify', durationMinutes: 120 });
    const doc = await activateDraftSession(client, DRAFT_ID, { ownerId: 'dj1' });
    expect(doc).toMatchObject({ status: 'active', plugin: 'spotify', addOns: ['spotify'] });
    const [filter, update] = client.col.updateOne.mock.calls[0];
    expect(filter.status).toBe('draft');
    expect(update.$set).toMatchObject({ plugin: 'spotify', addOns: ['spotify'] });
  });

  test('the music source chosen at launch overrides the draft', async () => {
    const client = mockClient({ _id: DRAFT_ID, ownerId: 'dj1', status: 'draft', plugin: 'spotify', durationMinutes: 120 });
    expect(await activateDraftSession(client, DRAFT_ID, { ownerId: 'dj1', plugin: 'standard' })).toMatchObject({ plugin: 'standard', addOns: [] });
  });

  test('buying an add-on adds it to the session (idempotently) and switches to it', async () => {
    const client = mockClient();
    const doc = await addSessionAddOn(client, DRAFT_ID, { ownerId: 'dj1', plugin: 'spotify' });
    expect(doc).toMatchObject({ plugin: 'spotify', addOns: ['spotify'] });
    const [filter, update] = client.col.findOneAndUpdate.mock.calls[0];
    expect(filter.ownerId).toBe('dj1');
    expect(update.$addToSet).toEqual({ addOns: 'spotify' });
  });
});

describe('resolveLaunch', () => {
  const opts = { tiersByMinutes, plugins };

  test('a new session is charged for its length', async () => {
    const launch = await resolveLaunch(mockClient(), 'dj1', { name: 'Friday', durationMinutes: 120, plugin: 'local-files' }, opts);
    expect(launch.error).toBeUndefined();
    expect(launch).toMatchObject({ draft: null, name: 'Friday', plugin: 'local-files', tier: { minutes: 120 } });
    expect(launch.charge.items.map(i => i.label)).toEqual(['DJ Session — 2 hrs']);
  });

  test('a coming-soon music source cannot be launched', async () => {
    expect(await resolveLaunch(mockClient(), 'dj1', { durationMinutes: 120, plugin: 'spotify' }, opts))
      .toMatchObject({ status: 400, error: 'That music source is coming soon' });
  });

  test('a draft launches with its saved length and music source', async () => {
    const draft = { _id: DRAFT_ID, ownerId: 'dj1', status: 'draft', name: 'Saturday', plugin: 'local-files', durationMinutes: 300 };
    const launch = await resolveLaunch(mockClient(draft), 'dj1', { draftSessionId: DRAFT_ID }, opts);
    expect(launch).toMatchObject({ name: 'Saturday', plugin: 'local-files', tier: { minutes: 300 } });
    expect(launch.charge.priceCents).toBe(400);
  });

  test('rejects a missing draft, a bad length and an unknown music source', async () => {
    expect(await resolveLaunch(mockClient(null), 'dj1', { draftSessionId: DRAFT_ID }, opts)).toMatchObject({ status: 404 });
    expect(await resolveLaunch(mockClient(), 'dj1', { durationMinutes: 7 }, opts)).toMatchObject({ status: 400 });
    expect(await resolveLaunch(mockClient(), 'dj1', { durationMinutes: 120, plugin: 'napster' }, opts)).toMatchObject({ status: 400 });
  });

  test('defaults to the Standard source', async () => {
    expect((await resolveLaunch(mockClient(), 'dj1', { durationMinutes: 120 }, opts)).plugin).toBe('standard');
  });
});
