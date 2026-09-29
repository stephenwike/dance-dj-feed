import { useState, useEffect, useRef, useCallback } from 'react';
import { LocalFilesAdapter } from '../../controllerAdapters';
import { nextInQueue, sortedQueue } from '../../queue';
import { advanceTo, patch } from '../../requests';
import { LocalPlayer } from './LocalPlayer';
import { CROSSFADE_OPTIONS } from './mixing';

const CROSSFADE_KEY = 'local-files:crossfade';
const OUTPUT_KEY = 'local-files:output-device';

// Mixing preferences belong to the computer playing the music, so they live
// in this browser rather than on the session.
function readPref(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writePref(key, value) {
  try {
    if (value === null || value === undefined || value === '') localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch { /* storage unavailable — the setting just won't persist */ }
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

/**
 * Drives a LocalPlayer from the working session's queue, and advances the
 * queue when a track finishes.
 *
 * The player belongs to the session whose track it holds (playing or
 * paused). If the DJ switches the controller to another floor, that floor's
 * music keeps going and its queue keeps advancing; the viewed session only
 * gets the player once it is idle, or when the DJ takes it over (takeOver).
 */
export function useLocalPlayback({ isActive, sessionId, rawRequests, mutate, library }) {
  const [state, setState] = useState({ requestId: null, entry: null, sessionId: null, blocked: false, error: null, fadingOut: false });
  const [crossfadeSec, setCrossfadeSec] = useState(0);
  const [outputDeviceId, setOutputDeviceId] = useState(null);
  const playerRef = useRef(null);
  const mutateRef = useRef(mutate);
  useEffect(() => { mutateRef.current = mutate; }, [mutate]);

  useEffect(() => {
    const player = new LocalPlayer({
      onChange: setState,
      onFinished: async (requestId, owner) => {
        try {
          // Re-read the owner's queue: the DJ (or another tab) may already have
          // moved on, or closed the session, while this track played.
          const [session, snap] = await Promise.all([
            getJson(`/api/dj/sessions/${owner}`),
            getJson(`/api/dj/requests?sessionId=${owner}`),
          ]);
          if (session.status !== 'active') { player.stop(); return; }
          const nowPlaying = snap.find(r => r.status === 'playing') ?? null;
          if (nowPlaying?._id !== requestId) { await player.sync(nowPlaying, owner); return; }

          const [next, afterNext] = sortedQueue(snap);
          const startedAt = new Date();
          await advanceTo(requestId, next, LocalFilesAdapter.playingStamps(), startedAt);
          mutateRef.current();
          // Start the next track now rather than waiting for the refetch (it is
          // usually preloaded already), then preload the one after it.
          await player.sync(next && { ...next, status: 'playing', playStartedAt: startedAt.toISOString(), pausedAt: null }, owner);
          player.setUpNext(afterNext);
        } catch (err) {
          setState(s => ({ ...s, error: `Couldn't advance the queue: ${err.message}` }));
        }
      },
    });

    const savedFade = Number(readPref(CROSSFADE_KEY));
    if (CROSSFADE_OPTIONS.includes(savedFade)) { player.setCrossfade(savedFade); setCrossfadeSec(savedFade); }
    const savedOutput = readPref(OUTPUT_KEY);
    if (savedOutput) { player.setOutputDevice(savedOutput); setOutputDeviceId(savedOutput); }

    playerRef.current = player;
    return () => player.dispose();
  }, []);

  useEffect(() => { playerRef.current?.setLibrary(library); }, [library]);

  // Follow the viewed session's playing request (and preload the one after it).
  const viewed = isActive && sessionId;
  const playing = viewed ? (rawRequests.find(r => r.status === 'playing') ?? null) : undefined;
  const upNext = viewed ? nextInQueue(rawRequests) : undefined;
  const ownsPlayer = player => !player.sessionId || player.sessionId === sessionId;

  useEffect(() => {
    const player = playerRef.current;
    if (!player || playing === undefined || !library.ready || !ownsPlayer(player)) return;
    player.sync(playing, sessionId);
  }, [isActive, library, sessionId, playing?._id, playing?.playStartedAt, playing?.pausedAt, playing?.localTrackKey, playing?.tempo]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || upNext === undefined || !ownsPlayer(player)) return;
    player.setUpNext(upNext);
  }, [isActive, sessionId, upNext?._id, upNext?.localTrackKey]);

  // This session stopped using the plugin: stop its music.
  useEffect(() => {
    const player = playerRef.current;
    if (!isActive && player?.sessionId && player.sessionId === sessionId) player.stop();
  }, [isActive, sessionId]);

  const setCrossfade = useCallback(sec => {
    playerRef.current?.setCrossfade(sec);
    setCrossfadeSec(sec);
    writePref(CROSSFADE_KEY, sec);
  }, []);

  const setOutputDevice = useCallback(deviceId => {
    playerRef.current?.setOutputDevice(deviceId);
    setOutputDeviceId(deviceId);
    writePref(OUTPUT_KEY, deviceId);
  }, []);

  const fadeToNext = useCallback(sec => playerRef.current?.fadeToNext(sec), []);

  /** Fade to silence, then pause the track in the queue. */
  const fadeOutAndPause = useCallback(async sec => {
    const player = playerRef.current;
    const requestId = player?.state.requestId;
    if (!requestId || !(await player.fadeOut(sec))) return;
    await patch(requestId, { pausedAt: new Date().toISOString() });
    mutateRef.current();
  }, []);

  return {
    ...state,
    // Another floor holds the player; this session's queue is on hold.
    busyElsewhere: !!state.requestId && state.sessionId !== sessionId,
    crossfadeSec,
    outputDeviceId,
    setCrossfade,
    setOutputDevice,
    fadeToNext,
    fadeOutAndPause,
    previewTempo: tempo => playerRef.current?.previewTempo(tempo),
    resume: () => playerRef.current?.resume(),
    /** Stop the other floor's track and play the viewed session instead. */
    takeOver: () => {
      const player = playerRef.current;
      if (!player) return;
      player.stop();
      if (playing !== undefined) player.sync(playing, sessionId);
    },
    /** Stop if `closingSessionId` (default: any) is the session being played. */
    stopFor: closingSessionId => {
      const player = playerRef.current;
      if (player && (!closingSessionId || player.sessionId === closingSessionId)) player.stop();
    },
  };
}
