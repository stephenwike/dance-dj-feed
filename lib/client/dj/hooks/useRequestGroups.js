import { useMemo } from 'react';
import { buildPendingGroups } from '../pendingGroups';
import { buildPlaysPerClient, computeScore } from '../fairnessScore';
import { buildRequesterGroups } from '../requesterGroups';
import { danceKey, isActive, sortedQueue } from '../queue';
import { beatsFromCents } from '../../../beats/constants';

const EMPTY_STATS = { count: 0, beats: 0, score: 0 };

/**
 * Derives all of the request-list groupings the controller renders:
 * queue/pending/playing/history slices, fairness scores, and the
 * "By Dance" / "By Requester" pending groups.
 */
export function useRequestGroups({ rawRequests, allRequests, fairnessScoringEnabled, decayEnabled, halfLifeMinutes, nicknameOverrides = {} }) {
  const pending = useMemo(() =>
    rawRequests.filter(r => r.status === 'pending').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [rawRequests]);

  const playing = useMemo(() =>
    rawRequests.filter(r => r.status === 'playing'), [rawRequests]);

  const queue = useMemo(() => sortedQueue(rawRequests), [rawRequests]);

  const history = useMemo(() =>
    rawRequests.filter(r => r.status === 'played').sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [rawRequests]);

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
    for (const r of history) {
      const key = danceKey(r);
      if (!map[key] || new Date(r.updatedAt) > new Date(map[key])) map[key] = r.updatedAt;
    }
    return map;
  }, [history]);

  const playsPerClient = useMemo(
    () => buildPlaysPerClient(rawRequests, { decayEnabled, halfLifeMinutes }),
    [rawRequests, decayEnabled, halfLifeMinutes]
  );

  // Live demand per dance (pending + approved + playing): how many requests,
  // total beats tipped, and fairness score. Queue cards and the now-playing
  // panel show these so they reflect everyone who asked, not just the single
  // request that was promoted.
  const danceStats = useMemo(() => {
    const groups = {};
    for (const r of rawRequests) {
      if (!isActive(r) || r.danceType === 'message') continue;
      (groups[danceKey(r)] ??= []).push(r);
    }
    const stats = {};
    for (const [key, reqs] of Object.entries(groups)) {
      stats[key] = {
        count: reqs.length,
        beats: beatsFromCents(reqs.reduce((sum, r) => sum + (r.tipCents ?? 0), 0)),
        score: computeScore(reqs, playsPerClient),
      };
    }
    return stats;
  }, [rawRequests, playsPerClient]);

  const statsFor = useMemo(() => r => (r ? danceStats[danceKey(r)] ?? EMPTY_STATS : EMPTY_STATS), [danceStats]);

  const danceGroups = useMemo(
    () => buildPendingGroups(pending, [...queue, ...playing], lastPlayedAt, playsPerClient, { fairness: fairnessScoringEnabled }),
    [pending, queue, playing, lastPlayedAt, playsPerClient, fairnessScoringEnabled]
  );

  const requesterGroups = useMemo(
    () => buildRequesterGroups(allRequests ?? rawRequests, resolvedNames, nicknameOverrides),
    [allRequests, rawRequests, resolvedNames, nicknameOverrides]
  );

  const nextQueuePos = (queue.at(-1)?.queuePosition ?? 0) + 1;

  return {
    pending, playing, queue, history,
    resolvedNames, statsFor,
    playsPerClient, danceGroups, requesterGroups, nextQueuePos,
  };
}
