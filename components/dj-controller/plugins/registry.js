/**
 * Playback plugin registry.
 *
 * A session's `plugin` field picks how music is played. Each plugin is a
 * plain descriptor; the controller never branches on plugin ids, it only
 * asks the active descriptor for its adapter, runtime and slot components.
 *
 * Descriptor shape:
 *   id          : string — stored on dj_sessions.plugin. Must also be listed
 *                 in SESSION_PLUGINS (lib/dj/sessionPricing.js) so the API
 *                 accepts it.
 *   label       : string — shown in the Settings picker
 *   description : string — one line under the label
 *   adapter     : controller adapter (lib/client/dj/controllerAdapters.js).
 *                 Its playingStamps() are applied to every track the
 *                 controller starts; StandardAdapter means the built-in
 *                 timer advances the queue.
 *   useRuntime  : React hook ({ isActive, sessionId, rawRequests, mutate })
 *                 → runtime. Every plugin's hook runs on every render and
 *                 must idle while !isActive. The runtime may implement:
 *                   onStartQueue(requestId) — the DJ pressed Start Queue
 *                   onCloseSession(sessionId) — that session was just closed
 *   slots       : { [slotName]: Component } — see PluginSlot.js for the
 *                 slot names and the props each slot receives.
 */
import standard from './standard';
import spotify from './spotify';
import localFiles from './localFiles';

export const PLUGIN_LIST = [standard, spotify, localFiles];

const BY_ID = Object.fromEntries(PLUGIN_LIST.map(p => [p.id, p]));

/** Descriptor for `id`, falling back to standard for missing/unknown ids. */
export function getPlugin(id) {
  return BY_ID[id] ?? standard;
}
