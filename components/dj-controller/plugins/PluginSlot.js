/**
 * Places in the controller where a playback plugin can render UI.
 *
 *   SIDEBAR_STATUS — bottom of the sidebar's navigation (connection status)
 *   OVERLAY        — covers the whole controller body (blocking notices)
 *   QUEUE_HEADER   — top of the queue column, above the player
 *   PLAYER         — replaces the default player (RemoteControl + empty state)
 *   QUEUE_FOOTER   — below the queue list (e.g. search to add tracks)
 *
 * Every slot component receives the same props:
 *   runtime    — what the plugin's useRuntime hook returned
 *   controller — { session, playing, queue, nextQueuePos, onAction, setPlugin }
 *                session is the live session (null for drafts); onAction is
 *                useRequestActions' handleAction.
 */
export const SLOTS = Object.freeze({
  SIDEBAR_STATUS: 'sidebarStatus',
  OVERLAY: 'overlay',
  QUEUE_HEADER: 'queueHeader',
  PLAYER: 'player',
  QUEUE_FOOTER: 'queueFooter',
});

export function hasSlot(plugin, name) {
  return !!plugin.slots?.[name];
}

/** Render `plugin`'s component for slot `name` (nothing if it has none). */
export default function PluginSlot({ plugin, name, runtime, controller }) {
  const Slot = plugin.slots?.[name];
  return Slot ? <Slot runtime={runtime} controller={controller} /> : null;
}
