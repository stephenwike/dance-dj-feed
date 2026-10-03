import { useCallback, useMemo, useEffect, useRef } from 'react';
import { patch } from '../../requests';
import { retimeForTempo, tempoOf } from '../../../../dj/tempo';
import { explainMatch, closestFiles, searchLibrary } from './library';
import { linkKeys } from './requestIdentity';
import { sameSettings, DEFAULT_SETTINGS } from './trackSettings';
import { useLocalLibrary } from './useLocalLibrary';
import { useLocalPlayback } from './useLocalPlayback';
import { useOutputDevices } from './useOutputDevices';

// Every request field that matching reads: a request re-fetched from the
// server with the same values reuses its cached match.
const MATCH_FIELDS = [
  '_id', 'localTrackKey', 'catalogTrackId', 'isrcs', 'danceId', 'danceName', 'danceType',
  'songName', 'artist', 'isSongSwap', 'swapSongName', 'swapArtist', 'duration_ms', 'tempo',
];
function matchCacheKey(request) {
  return JSON.stringify(MATCH_FIELDS.map(f => request[f] ?? null));
}

/**
 * Runtime for the local-files plugin: the DJ's music folder plus a player
 * that follows the queue. See components/dj-controller/plugins/localFiles
 * for the UI and plugins/registry.js for the runtime contract.
 */
export function useLocalFilesPlugin({ isActive, sessionId, rawRequests, mutate }) {
  const lib = useLocalLibrary(isActive);

  // The DJ's local memory: remembered files and play history.
  const memory = useMemo(() => ({ links: lib.links, history: lib.history }), [lib.links, lib.history]);
  // Matching can scan the whole library, and every queued card asks on every
  // queue refresh, so results are cached until the library or memory change.
  const matchCache = useMemo(() => new Map(), [lib.index, memory]);
  /** { entry, via } for a request, or null — see library.explainMatch. */
  const explainFor = useCallback(request => {
    const key = matchCacheKey(request);
    if (!matchCache.has(key)) matchCache.set(key, explainMatch(lib.index, request, memory));
    return matchCache.get(key);
  }, [lib.index, memory, matchCache]);
  const matchFor = useCallback(request => explainFor(request)?.entry ?? null, [explainFor]);
  const library = useMemo(
    () => ({ ready: lib.status === 'ready', resolve: matchFor, getFile: lib.getFile, settingsFor: lib.settingsFor }),
    [lib.status, matchFor, lib.getFile, lib.settingsFor],
  );
  const playback = useLocalPlayback({ isActive, sessionId, rawRequests, mutate, library });
  const outputs = useOutputDevices(isActive);

  const search = useCallback(query => searchLibrary(lib.index, query), [lib.index]);
  /** The files most like a request that matched nothing — for a one-click pick. */
  const closestCache = useMemo(() => new Map(), [lib.index]);
  const closestFor = useCallback(request => {
    const key = matchCacheKey(request);
    if (!closestCache.has(key)) closestCache.set(key, closestFiles(lib.index, request));
    return closestCache.get(key);
  }, [lib.index, closestCache]);

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
   * Pin a request to a file — picked by the DJ, or a guess they confirmed —
   * and remember it as the file for that dance (or, for a swap or partner
   * request, that song) from now on.
   */
  const assignFile = useCallback(async (request, entry) => {
    lib.rememberLinks(linkKeys(request), entry.key);
    await patch(request._id, { localTrackKey: entry.key });
    mutate();
  }, [mutate, lib.rememberLinks]);

  // Record each file that actually plays for a request, once per request:
  // the loose history behind 'history' matches (e.g. swaps played for a dance).
  // An unconfirmed fuzzy guess isn't recorded, or a wrong guess would come
  // back next time as "played for this before".
  const recordedRef = useRef(null);
  useEffect(() => {
    const { requestId, entry } = playback;
    if (!requestId || !entry || recordedRef.current === requestId) return;
    const request = rawRequests.find(r => r._id === requestId);
    if (!request) return;
    recordedRef.current = requestId;
    if (explainFor(request)?.via === 'suggested') return;
    lib.recordPlay(request, entry.key);
  }, [playback.requestId, playback.entry, rawRequests, explainFor, lib.recordPlay]);

  /** Change a request's tempo, keeping its place in the song. */
  const setTempo = useCallback(async (request, tempo) => {
    await patch(request._id, retimeForTempo(request, tempo));
    mutate();
  }, [mutate]);

  const playingRequest = playback.requestId ? rawRequests.find(r => r._id === playback.requestId) ?? null : null;

  /**
   * Jump the playing track to `sec` in its file, and move the queue's clock to
   * match so countdowns, the feed and remotes follow.
   */
  const seekTo = useCallback(async (request, sec) => {
    playback.seek(sec);
    const ref = request.pausedAt ? new Date(request.pausedAt).getTime() : Date.now();
    const wallMs = ((sec - playback.startOffset) * 1000) / tempoOf(request);
    await patch(request._id, { playStartedAt: new Date(ref - wallMs).toISOString() });
    mutate();
  }, [playback, mutate]);

  /** Save the playing track's volume, In/Out points and tempo to its file. */
  const saveTrackSettings = useCallback(() => {
    if (!playback.entry) return;
    lib.saveTrackSettings(playback.entry.key, { ...playback.adjust, tempo: playingRequest?.tempo ?? null });
  }, [playback.entry, playback.adjust, playingRequest?.tempo, lib.saveTrackSettings]);

  // Whether the playing track's current volume/points/tempo differ from what's saved.
  const trackSettingsDirty = !!playback.entry && !sameSettings(
    { ...playback.adjust, tempo: playingRequest?.tempo ?? null },
    playback.saved ?? DEFAULT_SETTINGS,
  );

  // A file saved with a tempo starts at it (unless this request already has one).
  const tempoAppliedRef = useRef(null);
  useEffect(() => {
    const saved = playback.saved?.tempo;
    if (!playingRequest || tempoAppliedRef.current === playingRequest._id) return;
    tempoAppliedRef.current = playingRequest._id;
    if (saved && !playingRequest.tempo) setTempo(playingRequest, saved);
  }, [playingRequest, playback.saved, setTempo]);


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
    closestFor,
    search,
    addToQueue,
    assignFile,
    setTempo,
    saveTrackSettings,
    trackSettingsDirty,
    seekTo,
    waveformFor: lib.waveformFor,
    onCloseSession: playback.stopFor,
  };
}
