import { LocalFilesAdapter } from '../../../../lib/client/dj/controllerAdapters';
import { useLocalFilesPlugin } from '../../../../lib/client/dj/plugins/localFiles/useLocalFilesPlugin';
import LocalFilesStatus from './LocalFilesStatus';
import LocalFilesQueueFooter from './LocalFilesQueueFooter';
import LocalFilesSidebarStatus from './LocalFilesSidebarStatus';
import UnsupportedBrowser from './UnsupportedBrowser';
import TrackFileRow, { itemTone } from './TrackFileRow';
import RemoteMix from './RemoteMix';

/**
 * Local files: the controller plays music from a folder on the DJ's
 * computer (Chrome/Edge only). The default player controls stay — the audio
 * follows the queue, so pause/skip/restart work as they do for Standard.
 */
export default {
  id: 'local-files',
  label: 'Local Files',
  description: 'Play music from a folder on this computer (Chrome or Edge)',
  adapter: LocalFilesAdapter,
  useRuntime: useLocalFilesPlugin,
  itemTone,
  slots: {
    overlay: UnsupportedBrowser,
    queueHeader: LocalFilesStatus,
    queueFooter: LocalFilesQueueFooter,
    sidebarStatus: LocalFilesSidebarStatus,
    queueItem: TrackFileRow,
    remoteControls: RemoteMix,
  },
};
