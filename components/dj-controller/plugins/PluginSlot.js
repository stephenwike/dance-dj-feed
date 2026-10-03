/**
 * Places in the controller where a playback plugin can render UI.
 *
 *   SIDEBAR_STATUS — bottom of the sidebar's navigation (connection status)
 *   OVERLAY        — covers the whole controller body (blocking notices)
 *   QUEUE_HEADER   — top of the queue column, above the player
 *   PLAYER         — replaces the default player (RemoteControl + empty state)
 *   QUEUE_FOOTER   — below the queue list (e.g. search to add tracks)
 *   QUEUE_ITEM     — inside each queued card and the now-playing card; also
 *                    receives `request` (e.g. the file that request will play)
 *   REMOTE_CONTROLS — in the Floor Remote (the phone view), under the transport:
 *                    controls for the playing track that work from any device
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
  QUEUE_ITEM: 'queueItem',
  REMOTE_CONTROLS: 'remoteControls',
});

export function hasSlot(plugin, name) {
  return !!plugin.slots?.[name];
}

/**
 * Render `plugin`'s component for slot `name` (nothing if it has none).
 * Extra props (e.g. `request` for QUEUE_ITEM) are passed through.
 */
export default function PluginSlot({ plugin, name, runtime, controller, ...extra }) {
  const Slot = plugin.slots?.[name];
  return Slot ? <Slot runtime={runtime} controller={controller} {...extra} /> : null;
}
