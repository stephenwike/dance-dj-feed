import { useState, useEffect, useRef } from 'react';
import { SpotifyAdapter } from '../controllerAdapters';
import { patch } from '../requests';

async function spotifyCmd(method, body) {
  const res = await fetch('/api/spotify/player', {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Spotify ${res.status}`);
  return data;
}

export function useSpotifyPlugin({ isActive, rawRequests, mutate }) {
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const allRequestsRef = useRef([]);
  const lastTrackUriRef = useRef(null);
  const queuedAheadRef = useRef(null);
  const aheadTimerRef = useRef(null);

  // Keep ref current so the polling closure always sees fresh requests
  useEffect(() => { allRequestsRef.current = rawRequests; }, [rawRequests]);

  // Check connection when plugin becomes active
  useEffect(() => {
    if (!isActive) return;
    fetch('/api/spotify/player')
      .then(r => r.json())
      .then(d => setConnected(!!d.connected))
      .catch(() => {});
    const params = new URLSearchParams(window.location.search);
    if (params.get('spotify_connected')) {
      setConnected(true);
      window.history.replaceState({}, '', '/dj-controller');
    }
  }, [isActive]);

  // Polling loop + track-change detection
  useEffect(() => {
    if (!isActive || !connected) return;
    let cancelled = false;

    async function queueNextTrack() {
      const allReqs = allRequestsRef.current;
      const nextUp = allReqs
        .filter(r => r.status === 'approved')
        .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))[0];
      if (!nextUp?.spotifyUri) return;
      if (queuedAheadRef.current === nextUp._id) return;
      try {
        await spotifyCmd('POST', { uri: nextUp.spotifyUri });
        queuedAheadRef.current = nextUp._id;
      } catch {}
    }

    async function poll() {
      try {
        const d = await fetch('/api/spotify/player').then(r => r.json());
        if (cancelled) return;
        setData(d);
        const currentUri = d?.playback?.item?.uri ?? null;
        const prevUri = lastTrackUriRef.current;
        if (currentUri && prevUri && currentUri !== prevUri) {
          const allReqs = allRequestsRef.current;
          const wasPlaying = allReqs.find(r => r.status === 'playing' && r.spotifyUri === prevUri);
          if (wasPlaying) {
            await patch(wasPlaying._id, { status: 'played' });
            const nextUp = allReqs
              .filter(r => r.status === 'approved')
              .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))[0];
            if (nextUp) {
              await patch(nextUp._id, {
                status: 'playing',
                playStartedAt: new Date(Date.now() - (d.playback?.progress_ms ?? 0)).toISOString(),
                ...SpotifyAdapter.playingStamps(),
              });
            }
            queuedAheadRef.current = null;
            if (aheadTimerRef.current) clearTimeout(aheadTimerRef.current);
            mutate();
          }
        }
        lastTrackUriRef.current = currentUri;
        if (d?.playback?.is_playing && d.playback.item) {
          const remaining = d.playback.item.duration_ms - d.playback.progress_ms;
          if (aheadTimerRef.current) clearTimeout(aheadTimerRef.current);
          if (remaining <= 5000) {
            await queueNextTrack();
          } else {
            aheadTimerRef.current = setTimeout(queueNextTrack, remaining - 5000);
          }
        }
      } catch {}
    }

    poll();
    const iv = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
      if (aheadTimerRef.current) clearTimeout(aheadTimerRef.current);
    };
  }, [isActive, connected, mutate]);

  async function handleControl(action) {
    try {
      if (action === 'previous') {
        await spotifyCmd('PUT', { action: 'seek', position_ms: 0 });
        const playingItem = allRequestsRef.current.find(r => r.status === 'playing');
        if (playingItem) { await patch(playingItem._id, { playStartedAt: new Date().toISOString() }); mutate(); }
      } else if (action === 'pause') {
        await spotifyCmd('PUT', { action: 'pause' });
        const playingItem = allRequestsRef.current.find(r => r.status === 'playing');
        if (playingItem) { await patch(playingItem._id, { pausedAt: new Date().toISOString() }); mutate(); }
      } else if (action === 'play') {
        await spotifyCmd('PUT', { action: 'play' });
        const playingItem = allRequestsRef.current.find(r => r.status === 'playing');
        if (playingItem?.pausedAt && playingItem?.playStartedAt) {
          const elapsed = new Date(playingItem.pausedAt) - new Date(playingItem.playStartedAt);
          await patch(playingItem._id, { playStartedAt: new Date(Date.now() - elapsed).toISOString(), pausedAt: null });
          mutate();
        }
      } else if (action === 'next') {
        const allReqs = allRequestsRef.current;
        const playingItem = allReqs.find(r => r.status === 'playing');
        if (playingItem) {
          await patch(playingItem._id, { status: 'played' });
          const nextUp = allReqs
            .filter(r => r.status === 'approved')
            .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))[0];
          if (nextUp) await patch(nextUp._id, { status: 'playing', playStartedAt: new Date().toISOString(), ...SpotifyAdapter.playingStamps() });
          mutate();
        }
        await spotifyCmd('PUT', { action: 'next' });
        setTimeout(() => fetch('/api/spotify/player').then(r => r.json()).then(d => {
          lastTrackUriRef.current = d?.playback?.item?.uri ?? null;
          setData(d);
        }).catch(() => {}), 800);
      }
      setError(null);
    } catch (err) {
      setError(err.message);
    }
    setTimeout(() => fetch('/api/spotify/player').then(r => r.json()).then(setData).catch(() => {}), 800);
  }

  async function handleAdd(track, nextQueuePos) {
    await fetch('/api/dj/requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        danceId: null, danceName: track.name, songName: track.name,
        artist: track.artists, duration_ms: track.duration_ms,
        spotifyUri: track.uri, clientId: 'dj', requesterName: 'DJ',
        notes: '', status: 'approved', queuePosition: nextQueuePos,
      }),
    });
    mutate();
  }

  async function onStartQueue(id) {
    if (!connected) return;
    const item = allRequestsRef.current.find(r => r._id === id);
    if (item?.spotifyUri) {
      try {
        await spotifyCmd('PUT', { action: 'play', uris: [item.spotifyUri] });
        await spotifyCmd('PUT', { action: 'repeat', state: 'off' });
        queuedAheadRef.current = null;
        setError(null);
      } catch (err) {
        setError(err.message);
      }
    }
  }

  async function onCloseSession() {
    if (connected) {
      try { await spotifyCmd('PUT', { action: 'pause' }); } catch {}
    }
  }

  function retry() {
    setError(null);
    fetch('/api/spotify/player').then(r => r.json()).then(setData).catch(() => {});
  }

  return { connected, data, error, handleControl, handleAdd, onStartQueue, onCloseSession, retry };
}
