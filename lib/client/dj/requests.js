// Thin client for the DJ-side request endpoints.

export async function patch(id, body) {
  await fetch(`/api/dj/requests/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function del(id) {
  await fetch(`/api/dj/requests/${id}`, { method: 'DELETE' });
}

/**
 * Mark `currentId` played and start `next` (if any). `stamps` come from the
 * controller adapter that owns playback (see controllerAdapters.js);
 * `startedAt` lets Spotify back-date the start to the track's real progress.
 */
export async function advanceTo(currentId, next, stamps, startedAt = new Date()) {
  if (currentId) await patch(currentId, { status: 'played' });
  if (next) await patch(next._id, { status: 'playing', playStartedAt: startedAt.toISOString(), ...stamps });
}
