import { useState, useEffect, useRef } from 'react';
import { LocalFilesAdapter } from '../../controllerAdapters';
import { nextInQueue } from '../../queue';
import { advanceTo } from '../../requests';
import { LocalPlayer } from './LocalPlayer';

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
  const [state, setState] = useState({ requestId: null, entry: null, sessionId: null, blocked: false, error: null });
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

          const next = nextInQueue(snap);
          const startedAt = new Date();
          await advanceTo(requestId, next, LocalFilesAdapter.playingStamps(), startedAt);
          mutateRef.current();
          // Start the next track now rather than waiting for the refetch.
          await player.sync(next && { ...next, status: 'playing', playStartedAt: startedAt.toISOString(), pausedAt: null }, owner);
        } catch (err) {
          setState(s => ({ ...s, error: `Couldn't advance the queue: ${err.message}` }));
        }
      },
    });
    playerRef.current = player;
    return () => player.dispose();
  }, []);

  useEffect(() => { playerRef.current?.setLibrary(library); }, [library]);

  // Follow the viewed session's playing request.
  const playing = isActive && sessionId ? (rawRequests.find(r => r.status === 'playing') ?? null) : undefined;
  useEffect(() => {
    const player = playerRef.current;
    if (!player || playing === undefined || !library.ready) return;
    if (player.sessionId && player.sessionId !== sessionId) return; // held by another floor
    player.sync(playing, sessionId);
  }, [isActive, library, sessionId, playing?._id, playing?.playStartedAt, playing?.pausedAt, playing?.localTrackKey]);

  // This session stopped using the plugin: stop its music.
  useEffect(() => {
    const player = playerRef.current;
    if (!isActive && player?.sessionId && player.sessionId === sessionId) player.stop();
  }, [isActive, sessionId]);

  return {
    ...state,
    // Another floor holds the player; this session's queue is on hold.
    busyElsewhere: !!state.requestId && state.sessionId !== sessionId,
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
