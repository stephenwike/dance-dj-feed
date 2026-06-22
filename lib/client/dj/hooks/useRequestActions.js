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
      await Promise.all((extra ?? []).map(r => patch(r._id, { status: 'skipped' })));
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
