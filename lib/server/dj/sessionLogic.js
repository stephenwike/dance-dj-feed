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

// Closes any other active sessions for ownerId, then creates a new
// dj_sessions document. Lenient/thin by design: durationMinutes defaults
// to 120 if missing/invalid. Strict tier/plugin validation belongs to
// callers (e.g. the checkout endpoint), not here.
async function createSession(client, { ownerId, name, plugin, durationMinutes }) {
  const col = client.db(DB_NAME).collection('dj_sessions');

  await col.updateMany(
    { status: 'active', ownerId },
    { $set: { status: 'closed', closedAt: new Date() } }
  );

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

module.exports = { createSession, defaultSessionName, makeSlug };
