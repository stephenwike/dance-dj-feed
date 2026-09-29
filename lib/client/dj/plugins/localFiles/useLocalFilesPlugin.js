import { useCallback, useMemo } from 'react';
import { patch } from '../../requests';
import { retimeForTempo } from '../../../../dj/tempo';
import { matchTrack, searchLibrary } from './library';
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

  const matchFor = useCallback(request => matchTrack(lib.index, request), [lib.index]);
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

  /** Pin a request to a specific file (when matching found none, or the wrong one). */
  const assignFile = useCallback(async (requestId, entry) => {
    await patch(requestId, { localTrackKey: entry.key });
    mutate();
  }, [mutate]);

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
    matchFor,
    search,
    addToQueue,
    assignFile,
    setTempo,
    onCloseSession: playback.stopFor,
  };
}
