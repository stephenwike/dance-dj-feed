import { PLUGIN_LIST, getPlugin } from './registry';

/**
 * Run every plugin's runtime hook and return the active plugin's runtime.
 *
 * All hooks run on every render, in PLUGIN_LIST order, so the Rules of Hooks
 * hold when the working session switches plugin; inactive ones idle. This
 * also lets a runtime finish work it started (e.g. a track still playing for
 * another floor) after the DJ switches the controller to a different session.
 */
export function usePluginRuntime(activeId, { sessionId, rawRequests, mutate }) {
  const active = getPlugin(activeId);
  let activeRuntime = null;
  for (const plugin of PLUGIN_LIST) {
    const runtime = plugin.useRuntime({ isActive: plugin === active, sessionId, rawRequests, mutate });
    if (plugin === active) activeRuntime = runtime;
  }
  return activeRuntime;
}
