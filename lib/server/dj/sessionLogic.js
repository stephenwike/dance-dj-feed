'use strict';
// Business logic for DJ session creation, extracted for testability.
// Exported as CJS so Jest can require() it directly without a transpiler.
// The ESM API routes import the named exports via interop.
const { DB_NAME, toObjectId, exactCaseInsensitive } = require('../db');

const DEFAULT_DURATION_MINUTES = 120;

// Settings every new session (draft or active) starts with.
const DEFAULT_SESSION_FLAGS = {
  closedAt: null,
  partnerDancesEnabled: true,
  weightDecayEnabled: false,
  weightDecayHalfLifeMinutes: 60,
  tippingEnabled: true,
};

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

function endsAtFrom(start, minutes) {
  return new Date(start.getTime() + minutes * 60 * 1000);
}

// Creates a new active dj_sessions document. Lenient/thin by design:
// durationMinutes defaults to 120 if missing/invalid. Strict tier/plugin
// validation belongs to callers (e.g. the checkout endpoint), not here.
async function createSession(client, { ownerId, name, plugin, durationMinutes }) {
  const col = client.db(DB_NAME).collection('dj_sessions');

  const resolvedName = name || defaultSessionName();
  const resolvedDuration = Number(durationMinutes) || DEFAULT_DURATION_MINUTES;
  const now = new Date();

  const doc = {
    ownerId,
    name: resolvedName,
    slug: makeSlug(resolvedName),
    status: 'active',
    plugin: plugin ?? 'standard',
    startedAt: now,
    endsAt: endsAtFrom(now, resolvedDuration),
    ...DEFAULT_SESSION_FLAGS,
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
    name: exactCaseInsensitive(resolvedName),
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
    ...DEFAULT_SESSION_FLAGS,
  };

  const result = await col.insertOne(doc);
  return { ...doc, _id: String(result.insertedId) };
}

/** The owner's draft with this id, or null. */
async function findDraft(client, sessionId, ownerId) {
  const objId = toObjectId(String(sessionId));
  if (!objId || !ownerId) return null;
  return client.db(DB_NAME).collection('dj_sessions').findOne({ _id: objId, ownerId, status: 'draft' });
}

// Activates one of the owner's draft sessions: sets startedAt/endsAt and
// transitions status to 'active'. Other sessions are left untouched.
async function activateDraftSession(client, sessionId, { ownerId, durationMinutes }) {
  const draft = await findDraft(client, sessionId, ownerId);
  if (!draft) throw Object.assign(new Error('Draft session not found'), { statusCode: 404 });

  const resolvedDuration = Number(durationMinutes) || Number(draft.durationMinutes) || DEFAULT_DURATION_MINUTES;
  const now = new Date();
  const endsAt = endsAtFrom(now, resolvedDuration);

  // Conditional on status so a replayed activation (e.g. duplicate webhook)
  // cannot restart an already-running session's clock.
  await client.db(DB_NAME).collection('dj_sessions').updateOne(
    { _id: draft._id, status: 'draft' },
    { $set: { status: 'active', startedAt: now, endsAt } },
  );

  return { ...draft, _id: String(draft._id), status: 'active', startedAt: now, endsAt };
}

/**
 * Close a session. `auto` marks it as closed by the expiry sweep rather than
 * the DJ. Report generation is left to the caller (it deletes the live requests).
 */
async function closeSession(client, sessionId, { auto = false, now = new Date() } = {}) {
  const set = { status: 'closed', closedAt: now, suppressedClientIds: [] };
  if (auto) set.autoClosedAt = now;
  await client.db(DB_NAME).collection('dj_sessions').updateOne({ _id: toObjectId(String(sessionId)) }, { $set: set });
  return set;
}

module.exports = {
  createSession, createDraftSession, findDraft, activateDraftSession, closeSession,
  defaultSessionName, makeSlug,
};
