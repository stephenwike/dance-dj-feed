import { StandardAdapter } from '../../../lib/client/dj/controllerAdapters';

const RUNTIME = Object.freeze({});

/**
 * Standard: the DJ plays music from any source by hand; the built-in timer
 * advances the queue. Renders no slots, so the controller's defaults show.
 */
export default {
  id: 'standard',
  label: 'Standard',
  description: 'Play music from any source; the queue advances on a timer',
  adapter: StandardAdapter,
  useRuntime: () => RUNTIME,
  slots: {},
};
