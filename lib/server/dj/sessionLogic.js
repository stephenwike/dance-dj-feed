'use strict';
// Business logic for DJ session creation, extracted for testability.
// Exported as CJS so Jest can require() it directly without a transpiler.
// The ESM API routes import the named exports via interop.
const DB_NAME = process.env.MONGODB_DB || 'djfeed';

function defaultSessionName() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

/** URL-safe slug from a session name + timestamp, e.g. "friday-night-may-9-1715" */
function makeSlug(name) {
  const datePart = new Date()
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toLowerCase().replace(/\s+/g, '-');
  const namePart = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 30);
  return `${namePart}-${datePart}`;
}

// Creates a new active dj_sessions document. Lenient/thin by design:
// durationMinutes defaults to 120 if missing/invalid. Strict tier/plugin
// validation belongs to callers (e.g. the checkout endpoint), not here.
async function createSession(client, { ownerId, name, plugin, durationMinutes }) {
  const col = client.db(DB_NAME).collection('dj_sessions');

  const resolvedName = name || defaultSessionName();
  const resolvedPlugin = plugin ?? 'standard';
  const resolvedDuration = Number(durationMinutes) || 120;
  const now = new Date();

  const doc = {
    ownerId,
    name: resolvedName,
    slug: makeSlug(resolvedName),
    status: 'active',
    plugin: resolvedPlugin,
    startedAt: now,
    endsAt: new Date(now.getTime() + resolvedDuration * 60 * 1000),
    closedAt: null,
    partnerDancesEnabled: true,
    weightDecayEnabled: false,
    weightDecayHalfLifeMinutes: 60,
    tippingEnabled: true,
  };

  const result = await col.insertOne(doc);
  return { ...doc, _id: String(result.insertedId) };
}

// Creates a draft session with no duration or endsAt. The DJ can pre-load the
// queue before activating (and paying). Multiple drafts can coexist.
async function createDraftSession(client, { ownerId, name, durationMinutes }) {
  const col = client.db(DB_NAME).collection('dj_sessions');

  const resolvedName = name || defaultSessionName();

  const collision = await col.findOne({
    ownerId,
    status: { $in: ['draft', 'active'] },
    name: { $regex: `^${resolvedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  });
  if (collision) throw Object.assign(new Error(`A session named "${resolvedName}" already exists`), { statusCode: 409 });

  const doc = {
    ownerId,
    name: resolvedName,
    slug: makeSlug(resolvedName),
    status: 'draft',
    plugin: 'standard',
    durationMinutes: Number(durationMinutes) || null,
    startedAt: null,
    endsAt: null,
    closedAt: null,
    partnerDancesEnabled: true,
    weightDecayEnabled: false,
    weightDecayHalfLifeMinutes: 60,
    tippingEnabled: true,
  };

  const result = await col.insertOne(doc);
  return { ...doc, _id: String(result.insertedId) };
}

// Activates an existing draft session: sets startedAt/endsAt and transitions
// status to 'active'. Other sessions are left untouched.
async function activateDraftSession(client, sessionId, { durationMinutes }) {
  const { ObjectId } = require('mongodb');
  const col = client.db(DB_NAME).collection('dj_sessions');

  const objId = new ObjectId(sessionId);
  const draft = await col.findOne({ _id: objId, status: 'draft' });
  if (!draft) throw Object.assign(new Error('Draft session not found'), { statusCode: 404 });

  const resolvedDuration = Number(durationMinutes) || Number(draft.durationMinutes) || 120;
  const now = new Date();
  const endsAt = new Date(now.getTime() + resolvedDuration * 60 * 1000);

  await col.updateOne({ _id: objId }, {
    $set: { status: 'active', startedAt: now, endsAt },
  });

  return { ...draft, _id: String(objId), status: 'active', startedAt: now, endsAt };
}

module.exports = { createSession, createDraftSession, activateDraftSession, defaultSessionName, makeSlug };
