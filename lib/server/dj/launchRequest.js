'use strict';
// What a "go live" request asks for, shared by the card (checkout) and
// wallet payment routes so they charge for exactly the same thing.
const { findDraft } = require('./sessionLogic');
const { launchCharge } = require('../../dj/sessionAddOns');
const { isAvailable } = require('../../dj/musicSources');
// sessionPricing.js is ESM (also imported by pages), so the tiers are passed in.

/**
 * Resolve a launch from the request body:
 *   { draftSessionId } — launch a saved draft (its length and music source,
 *                        unless the body overrides them), or
 *   { name, durationMinutes, plugin } — start a new session straight away.
 *
 * Returns { error, status } or { draft, name, tier, plugin, charge }.
 */
async function resolveLaunch(client, ownerId, body, { tiersByMinutes, plugins }) {
  const { name, draftSessionId } = body ?? {};
  let { durationMinutes, plugin } = body ?? {};

  let draft = null;
  if (draftSessionId) {
    draft = await findDraft(client, draftSessionId, ownerId);
    if (!draft) return { status: 404, error: 'Draft session not found' };
    durationMinutes = durationMinutes || draft.durationMinutes;
    plugin = plugin || draft.plugin;
  }

  const tier = tiersByMinutes[Number(durationMinutes)];
  if (!tier) return { status: 400, error: 'Invalid duration — choose how long the event runs first' };

  const resolvedPlugin = plugin || 'standard';
  if (!plugins.includes(resolvedPlugin)) return { status: 400, error: 'Invalid music source' };
  if (!isAvailable(resolvedPlugin)) return { status: 400, error: 'That music source is coming soon' };

  return {
    draft,
    name: draft?.name ?? name ?? '',
    tier,
    plugin: resolvedPlugin,
    charge: launchCharge(tier, resolvedPlugin),
  };
}

module.exports = { resolveLaunch };
