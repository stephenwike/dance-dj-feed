'use strict';
/**
 * Paid music sources ("add-ons") and what launching a session costs.
 *
 * Standard and Local Files are always included. Other music sources are a
 * flat fee per session: bought when the session is created or launched, or
 * later from the controller. Once a session has bought one, the DJ can switch
 * to it and away from it freely for the rest of that session; extensions
 * don't charge it again.
 *
 * Shared by the browser (prices shown) and the server (prices charged and
 * the plugin-switch check), so the two can't disagree.
 */

const { musicSource } = require('./musicSources');

// Wallet payments skip Stripe, so they cost the Stripe fee less (2.9% + 30¢):
// the platform nets the same, and the DJ keeps the difference.
function walletPriceCents(priceCents) {
  return priceCents - (Math.round(priceCents * 0.029) + 30);
}

// Paid music sources, by plugin id (see components/dj-controller/plugins).
// Both are "coming soon" for now (lib/dj/musicSources.js); prices are
// provisional until they launch.
const PLUGIN_ADD_ONS = {
  spotify: { priceCents: 100 },
  'apple-music': { priceCents: 100 },
};

/** The add-on for `plugin` ({ plugin, label, priceCents, walletPriceCents }), or null if it's included. */
function addOnFor(plugin) {
  const addOn = PLUGIN_ADD_ONS[plugin];
  if (!addOn) return null;
  return { plugin, label: musicSource(plugin).label, ...addOn, walletPriceCents: walletPriceCents(addOn.priceCents) };
}

function isPaidPlugin(plugin) {
  return !!PLUGIN_ADD_ONS[plugin];
}

/**
 * Whether `session` may play with `plugin` without buying anything.
 * Sessions from before add-ons existed have no `addOns` field at all; they
 * keep every source they could use when they were started.
 */
function sessionHasPlugin(session, plugin) {
  if (!isPaidPlugin(plugin)) return true;
  if (session && !Array.isArray(session.addOns)) return true;
  return (session?.addOns ?? []).includes(plugin);
}

/** The add-ons a session starts with when it launches with `plugin`. */
function addOnsForLaunch(plugin) {
  return isPaidPlugin(plugin) ? [plugin] : [];
}

/**
 * What launching a session costs: the length tier plus the music source's
 * add-on, if any. `items` are the Stripe line items / receipt lines.
 */
function launchCharge(tier, plugin) {
  const items = [{ label: `DJ Session — ${tier.label}`, priceCents: tier.priceCents }];
  const addOn = addOnFor(plugin);
  if (addOn) items.push({ label: `${addOn.label} add-on`, priceCents: addOn.priceCents });
  const priceCents = items.reduce((sum, i) => sum + i.priceCents, 0);
  return { items, priceCents, walletPriceCents: walletPriceCents(priceCents) };
}

module.exports = {
  PLUGIN_ADD_ONS, walletPriceCents, addOnFor, isPaidPlugin, sessionHasPlugin, addOnsForLaunch, launchCharge,
};
