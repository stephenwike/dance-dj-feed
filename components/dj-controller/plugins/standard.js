import { StandardAdapter } from '../../../lib/client/dj/controllerAdapters';
import { musicSource } from '../../../lib/dj/musicSources';

const RUNTIME = Object.freeze({});

/**
 * Standard: the DJ plays music from any source by hand; the built-in timer
 * advances the queue. Renders no slots, so the controller's defaults show.
 */
export default {
  id: 'standard',
  label: musicSource('standard').label,
  description: musicSource('standard').description,
  adapter: StandardAdapter,
  useRuntime: () => RUNTIME,
  slots: {},
};
