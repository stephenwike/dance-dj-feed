import { useCallback, useMemo } from 'react';
import { patch } from '../../requests';
import { retimeForTempo } from '../../../../dj/tempo';
import { explainMatch, searchLibrary } from './library';
import { useLocalLibrary } from './useLocalLibrary';
import { useLocalPlayback } from './useLocalPlayback';
import { useOutputDevices } from './useOutputDevices';

/**
 * Runtime for the local-files plugin: the DJ's music folder plus a player
 * that follows the queue. See components/dj-controller/plugins/localFiles
 * for the UI and plugins/registry.js for the runtime contract.
 */
export function useLocalFilesPlugin({ isActive, sessionId, rawRequests, mutate }) {
  const lib = useLocalLibrary(isActive);

  /** { entry, via } for a request, or null — see library.explainMatch. */
  const explainFor = useCallback(request => explainMatch(lib.index, request, lib.links), [lib.index, lib.links]);
  const matchFor = useCallback(request => explainFor(request)?.entry ?? null, [explainFor]);
  const library = useMemo(
    () => ({ ready: lib.status === 'ready', resolve: matchFor, getFile: lib.getFile }),
    [lib.status, matchFor, lib.getFile],
  );
  const playback = useLocalPlayback({ isActive, sessionId, rawRequests, mutate, library });
  const outputs = useOutputDevices(isActive);

  const search = useCallback(query => searchLibrary(lib.index, query), [lib.index]);

  /** Queue a track from the library as a DJ request. */
  const addToQueue = useCallback(async (entry, queuePosition) => {
    await fetch('/api/dj/requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        danceId: null, danceName: entry.title, songName: entry.title, artist: entry.artist,
        duration_ms: entry.durationMs, localTrackKey: entry.key,
        clientId: 'dj', requesterName: 'DJ', sessionId, notes: '',
        status: 'approved', queuePosition,
      }),
    });
    mutate();
  }, [sessionId, mutate]);

  /**
   * Pin a request to a specific file (when matching found none, or the wrong
   * one). For a catalog song, also remember the choice for future requests.
   */
  const assignFile = useCallback(async (request, entry) => {
    if (request.catalogTrackId) lib.rememberLink(request.catalogTrackId, entry.key);
    await patch(request._id, { localTrackKey: entry.key });
    mutate();
  }, [mutate, lib.rememberLink]);

  /** Change a request's tempo, keeping its place in the song. */
  const setTempo = useCallback(async (request, tempo) => {
    await patch(request._id, retimeForTempo(request, tempo));
    mutate();
  }, [mutate]);

  return {
    library: {
      status: lib.status,
      folderName: lib.folderName,
      trackCount: lib.index.size,
      scan: lib.scan,
      error: lib.error,
      chooseFolder: lib.chooseFolder,
      reconnect: lib.reconnect,
      rescan: lib.rescan,
    },
    playback,
    outputs,
    explainFor,
    matchFor,
    search,
    addToQueue,
    assignFile,
    setTempo,
    onCloseSession: playback.stopFor,
  };
}
