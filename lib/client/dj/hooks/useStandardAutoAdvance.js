import { useEffect } from 'react';
import { remainingMs } from '../autoAdvance';
import { StandardAdapter } from '../controllerAdapters';

/**
 * Auto-advance when the track timer expires — mirrors the dj-feed timer so
 * the queue advances even when the feed is not open in a browser tab.
 * Spotify plugin owns its own advancement via polling; skip for that case.
 */
export function useStandardAutoAdvance({ isSpotify, playingItem, mutate, sessionId }) {
  useEffect(() => {
    if (isSpotify) return;
    if (!StandardAdapter.shouldAutoAdvance(playingItem)) return;
    const id = playingItem._id;
    const ms = remainingMs(playingItem);

    async function advance() {
      const url = sessionId ? `/api/dj/requests?sessionId=${sessionId}` : '/api/dj/requests';
      const snap = await fetch(url).then(r => r.json()).catch(() => []);
      const still = snap.find(r => r._id === id && r.status === 'playing');
      if (!still) return;
      await fetch(`/api/dj/requests/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'played' }),
      });
      const nextUp = snap
        .filter(r => r.status === 'approved')
        .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))[0];
      if (nextUp) {
        await fetch(`/api/dj/requests/${nextUp._id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'playing', playStartedAt: new Date().toISOString(), ...StandardAdapter.playingStamps() }),
        });
      }
      mutate();
    }

    if (ms === 0) { advance(); return; }
    const t = setTimeout(advance, ms);
    return () => clearTimeout(t);
  }, [isSpotify, playingItem?._id, playingItem?.playStartedAt, playingItem?.duration_ms,
      playingItem?.spotifyUri, playingItem?.pausedAt, mutate]);
}
