import { useCallback } from 'react';
import { StandardAdapter, SpotifyAdapter } from '../controllerAdapters';
import { patch, del } from '../requests';

/**
 * Request/queue mutations: per-request actions dispatched from the queue
 * and pending columns, plus history clearing and custom-request edits.
 */
export function useRequestActions({ rawRequests, queue, nextQueuePos, history, isSpotify, spotify, mutate }) {
  const handleAction = useCallback(async (id, action, extra) => {
    if (action === 'mutate') {
      // no-op — just triggers mutate() below
    } else if (action === 'denyGroup') {
      // extra = array of all requests in the group
      await Promise.all((extra ?? []).map(r => patch(r._id, { status: 'denied' })));
    } else if (action === 'approve') {
      await patch(id, { status: 'approved', queuePosition: nextQueuePos });
    } else if (action === 'skip') {
      await patch(id, { status: 'skipped' });
    } else if (action === 'played') {
      await patch(id, { status: 'played' });
    } else if (action === 'dequeue') {
      await patch(id, { status: 'pending', queuePosition: null });
    } else if (action === 'remove') {
      await del(id);
    } else if (action === 'startQueue') {
      const stamps = isSpotify ? SpotifyAdapter.playingStamps() : StandardAdapter.playingStamps();
      await patch(id, { status: 'playing', playStartedAt: new Date().toISOString(), ...stamps });
      if (isSpotify) await spotify.onStartQueue(id);
    } else if (action === 'pause') {
      await patch(id, { pausedAt: new Date().toISOString() });
    } else if (action === 'resume') {
      const r = rawRequests.find(r => r._id === id);
      if (r?.pausedAt && r?.playStartedAt) {
        const elapsed = new Date(r.pausedAt) - new Date(r.playStartedAt);
        await patch(id, { playStartedAt: new Date(Date.now() - elapsed).toISOString(), pausedAt: null });
      }
    } else if (action === 'advance') {
      await patch(id, { status: 'played' });
      if (queue[0]) {
        await patch(queue[0]._id, { status: 'playing', playStartedAt: new Date().toISOString(), ...StandardAdapter.playingStamps() });
      }
    } else if (action === 'restart') {
      // Reset countdown to full duration; if paused, keep paused at "now" so elapsed stays 0 on resume
      const r = rawRequests.find(r => r._id === id);
      const now = new Date().toISOString();
      await patch(id, r?.pausedAt ? { playStartedAt: now, pausedAt: now } : { playStartedAt: now });
    } else if (action === 'shiftTime') {
      // extra > 0: rewind (adds remaining), extra < 0: fast-forward (subtracts remaining)
      const r = rawRequests.find(r => r._id === id);
      if (r?.playStartedAt) {
        let newStartMs = new Date(r.playStartedAt).getTime() + extra;
        // Cap rewind: playStartedAt can't be later than the reference time (which would give negative elapsed)
        if (extra > 0) {
          const refMs = r.pausedAt ? new Date(r.pausedAt).getTime() : Date.now();
          newStartMs = Math.min(newStartMs, refMs);
        }
        await patch(id, { playStartedAt: new Date(newStartMs).toISOString() });
      }
    } else if (action === 'requeue') {
      // Return current playing track to the front of the queue
      const front = queue[0]?.queuePosition ?? 1;
      await patch(id, { status: 'approved', queuePosition: front - 1 });
    }
    mutate();
  }, [nextQueuePos, queue, rawRequests, mutate, isSpotify, spotify]);

  async function clearHistory() {
    await Promise.all(history.map(r => del(r._id)));
    mutate();
  }

  async function saveGroupEdit(requests, updates) {
    await Promise.all(requests.map(r =>
      fetch(`/api/dj/requests/${r._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
    ));
    mutate();
  }

  return { handleAction, clearHistory, saveGroupEdit };
}
