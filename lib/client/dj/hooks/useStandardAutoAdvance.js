import { useEffect } from 'react';
import { remainingMs } from '../autoAdvance';
import { StandardAdapter } from '../controllerAdapters';
import { nextInQueue } from '../queue';
import { advanceTo } from '../requests';

/**
 * Auto-advance when the track timer expires, so the queue keeps moving even
 * when the feed is not open in a browser tab.
 * Spotify plugin owns its own advancement via polling; skip for that case.
 */
export function useStandardAutoAdvance({ isSpotify, playingItem, mutate, sessionId }) {
  useEffect(() => {
    if (isSpotify || !sessionId) return;
    if (!StandardAdapter.shouldAutoAdvance(playingItem)) return;
    const id = playingItem._id;
    const ms = remainingMs(playingItem);

    async function advance() {
      // Re-read the queue first: another tab (or the DJ) may already have advanced.
      const snap = await fetch(`/api/dj/requests?sessionId=${sessionId}`).then(r => r.json()).catch(() => []);
      if (!Array.isArray(snap) || !snap.some(r => r._id === id && r.status === 'playing')) return;
      await advanceTo(id, nextInQueue(snap), StandardAdapter.playingStamps());
      mutate();
    }

    if (ms === 0) { advance(); return; }
    const t = setTimeout(advance, ms);
    return () => clearTimeout(t);
  }, [isSpotify, sessionId, playingItem?._id, playingItem?.playStartedAt, playingItem?.duration_ms,
      playingItem?.spotifyUri, playingItem?.pausedAt, mutate]);
}
