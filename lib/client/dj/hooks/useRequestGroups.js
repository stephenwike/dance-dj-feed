import { useMemo } from 'react';
import { buildPendingGroups } from '../pendingGroups';
import { buildPlaysPerClient } from '../fairnessScore';
import { buildRequesterGroups } from '../requesterGroups';

/**
 * Derives all of the request-list groupings the controller renders:
 * queue/pending/playing/history slices, fairness scores, and the
 * "By Dance" / "By Requester" pending groups.
 */
export function useRequestGroups({ rawRequests, fairnessScoringEnabled, decayEnabled, halfLifeMinutes }) {
  const pending = useMemo(() =>
    rawRequests.filter(r => r.status === 'pending').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [rawRequests]);

  const playing = useMemo(() =>
    rawRequests.filter(r => r.status === 'playing'), [rawRequests]);

  const queue = useMemo(() =>
    rawRequests.filter(r => r.status === 'approved').sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0)),
    [rawRequests]);

  const history = useMemo(() =>
    rawRequests.filter(r => r.status === 'played' || r.status === 'skipped').sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [rawRequests]);

  const repeatClientIds = useMemo(() => {
    const counts = {};
    for (const r of pending) if (r.clientId) counts[r.clientId] = (counts[r.clientId] ?? 0) + 1;
    return new Set(Object.keys(counts).filter(id => counts[id] > 1));
  }, [pending]);

  const resolvedNames = useMemo(() => {
    const map = {};
    for (const r of [...rawRequests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))) {
      if (!r.clientId || map[r.clientId]) continue;
      const custom = r.requesterName && r.requesterName !== r.clientId;
      map[r.clientId] = custom ? r.requesterName : r.clientId;
    }
    return map;
  }, [rawRequests]);

  // Most recent played time per dance (for REPEAT count)
  const lastPlayedAt = useMemo(() => {
    const map = {};
    for (const r of rawRequests.filter(r => r.status === 'played')) {
      const key = (r.danceName || '').toLowerCase().trim();
      if (!map[key] || new Date(r.updatedAt) > new Date(map[key])) map[key] = r.updatedAt;
    }
    return map;
  }, [rawRequests]);

  // Total active requests per dance key (pending + approved + playing)
  const danceRequestCounts = useMemo(() => {
    const counts = {};
    for (const r of rawRequests.filter(r => ['pending', 'approved', 'playing'].includes(r.status))) {
      const key = (r.danceName || '').toLowerCase().trim();
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [rawRequests]);

  // Upvote counts for partner dances keyed by partnerGroupId.
  // Used to show how many attendees want a queued partner dance.
  const partnerUpvoteCounts = useMemo(() => {
    const counts = {};
    for (const r of rawRequests) {
      if (r.danceType === 'partner' && r.partnerGroupId && ['pending', 'approved', 'playing'].includes(r.status)) {
        counts[r.partnerGroupId] = (counts[r.partnerGroupId] ?? 0) + 1;
      }
    }
    return counts;
  }, [rawRequests]);

  const playsPerClient = useMemo(
    () => buildPlaysPerClient(rawRequests, { decayEnabled, halfLifeMinutes }),
    [rawRequests, decayEnabled, halfLifeMinutes]
  );

  const danceGroups = useMemo(
    () => buildPendingGroups(pending, [...queue, ...playing], lastPlayedAt, playsPerClient, { fairness: fairnessScoringEnabled }),
    [pending, queue, playing, lastPlayedAt, playsPerClient, fairnessScoringEnabled]
  );

  const requesterGroups = useMemo(
    () => buildRequesterGroups(rawRequests, resolvedNames),
    [rawRequests, resolvedNames]
  );

  const nextQueuePos = useMemo(() => queue.reduce((m, r) => Math.max(m, r.queuePosition ?? 0), 0) + 1, [queue]);

  return {
    pending, playing, queue, history,
    repeatClientIds, resolvedNames, lastPlayedAt, danceRequestCounts, partnerUpvoteCounts,
    playsPerClient, danceGroups, requesterGroups, nextQueuePos,
  };
}
