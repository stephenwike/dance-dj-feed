import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '../../fetcher';

const DECAY_OPTIONS = [
  { label: 'None',    enabled: false, minutes: 60 },
  { label: '30 mins', enabled: true,  minutes: 30 },
  { label: '1 hour',  enabled: true,  minutes: 60 },
  { label: '2 hours', enabled: true,  minutes: 120 },
];

async function patchSession(id, body) {
  await fetch(`/api/dj/sessions/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Session lifecycle (start/close/resume) and per-session settings
 * (partner dances, tipping, fairness decay).
 *
 * A DJ can have several live sessions (e.g. multiple floors).
 * `workingSession` is the one the controller is showing; every setting reads
 * from and writes to that session. Drafts never reach the controller: they
 * are planned on their own page (pages/dj-plan.js) until they go live.
 */
export function useSessionManager() {
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const { data: sessions = [], mutate: mutateSessions } = useSWR('/api/dj/sessions', fetcher, {
    refreshInterval: 30000, revalidateOnFocus: true,
  });

  const liveSessions = sessions.filter(s => s.status === 'active');
  const activeSession = liveSessions[0] ?? null;

  // workingSession: the selected live session, else the first one.
  const workingSession =
    (selectedSessionId && liveSessions.find(s => s._id === selectedSessionId))
    ?? activeSession;
  const ws = workingSession;

  function selectSession(id) { setSelectedSessionId(id); }
  // Playback plugin for the working session (see components/dj-controller/plugins).
  const pluginId = ws?.plugin ?? 'standard';
  const fairnessScoringEnabled = ws?.fairnessScoringEnabled !== false;
  const decayEnabled = ws?.weightDecayEnabled ?? false;
  const halfLifeMinutes = ws?.weightDecayHalfLifeMinutes ?? 60;
  const tippingEnabled = ws?.tippingEnabled !== false;
  const partnerDancesEnabled = ws?.partnerDancesEnabled !== false;
  const requestsEnabled = ws?.requestsEnabled !== false;
  const queueVisibleToRequesters = ws?.queueVisibleToRequesters !== false;
  const queueVisibleCount = ws?.queueVisibleCount ?? 4;
  const feedAspectRatio = ws?.feedAspectRatio ?? '16:9';
  const feedTemplateId = ws?.feedTemplateId ?? 'default';

  // Apply a settings change to the working session and refresh.
  async function updateWorkingSession(body) {
    if (!ws) return;
    await patchSession(ws._id, body);
    mutateSessions();
  }

  // Close session `id` (default: the working session if live, else the first
  // active one). onBeforeMutate(closedId) lets index.js run plugin-specific
  // teardown (e.g. pausing playback) between the PATCH and the revalidation.
  async function closeSession({ id, onBeforeMutate } = {}) {
    const targetId = id ?? (ws?.status === 'active' ? ws : activeSession)?._id;
    if (!targetId) return;
    await patchSession(targetId, { status: 'closed' });
    if (onBeforeMutate) await onBeforeMutate(targetId);
    setSelectedSessionId(null);
    mutateSessions();
  }

  async function continueSession(id, onDone) {
    await patchSession(id, { status: 'active' });
    setSelectedSessionId(id);
    mutateSessions();
    if (onDone) await onDone();
  }

  const decayIdx = DECAY_OPTIONS.findIndex(p =>
    p.enabled === decayEnabled && (!p.enabled || p.minutes === halfLifeMinutes)
  );
  const decayLabel = DECAY_OPTIONS[decayIdx]?.label ?? 'None';

  function cycleDecay() {
    const next = DECAY_OPTIONS[(decayIdx + 1) % DECAY_OPTIONS.length];
    return updateWorkingSession({ weightDecayEnabled: next.enabled, weightDecayHalfLifeMinutes: next.minutes });
  }

  return {
    sessions, liveSessions, activeSession, workingSession, pluginId, mutateSessions,
    selectSession, closeSession, continueSession,
    togglePartnerDances: () => updateWorkingSession({ partnerDancesEnabled: !partnerDancesEnabled }),
    toggleTipping: () => updateWorkingSession({ tippingEnabled: !tippingEnabled }),
    toggleRequestsEnabled: () => updateWorkingSession({ requestsEnabled: !requestsEnabled }),
    toggleWeighting: () => updateWorkingSession({ fairnessScoringEnabled: !fairnessScoringEnabled }),
    toggleQueueVisibility: () => updateWorkingSession({ queueVisibleToRequesters: !queueVisibleToRequesters }),
    setQueueVisibleCount: count => updateWorkingSession({ queueVisibleCount: count }),
    setPlugin: id => updateWorkingSession({ plugin: id }),
    setFeedAspectRatio: ratio => updateWorkingSession({ feedAspectRatio: ratio }),
    setFeedTemplateId: id => updateWorkingSession({ feedTemplateId: id }),
    applyFeedTemplate: () => updateWorkingSession({ feedAppliedAt: new Date().toISOString() }),
    cycleDecay,
    tippingEnabled, partnerDancesEnabled, requestsEnabled, fairnessScoringEnabled, decayEnabled, halfLifeMinutes, decayLabel,
    queueVisibleToRequesters, queueVisibleCount, feedAspectRatio, feedTemplateId,
  };
}
