import { useState } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';

const fetcher = url => fetch(url).then(r => r.json());

const DECAY_OPTIONS = [
  { label: 'None',    enabled: false, minutes: 60 },
  { label: '30 mins', enabled: true,  minutes: 30 },
  { label: '1 hour',  enabled: true,  minutes: 60 },
  { label: '2 hours', enabled: true,  minutes: 120 },
];

/**
 * Session lifecycle (start/close/resume) and per-session settings
 * (partner dances, tipping, fairness decay).
 */
export function useSessionManager() {
  const router = useRouter();

  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const { data: sessions = [], mutate: mutateSessions } = useSWR('/api/dj/sessions', fetcher, {
    refreshInterval: 30000, revalidateOnFocus: true,
  });

  const liveSessions = sessions.filter(s => s.status === 'active' || s.status === 'draft');
  const activeSession = sessions.find(s => s.status === 'active') ?? null;
  const draftSession = sessions.find(s => s.status === 'draft') ?? null;

  // workingSession: respect explicit selection, then fall back to active → draft.
  const workingSession =
    (selectedSessionId && liveSessions.find(s => s._id === selectedSessionId))
    ?? activeSession
    ?? draftSession;

  function selectSession(id) { setSelectedSessionId(id); }
  const isSpotify = activeSession?.plugin === 'spotify';
  const fairnessScoringEnabled = activeSession?.fairnessScoringEnabled !== false;
  const decayEnabled = activeSession?.weightDecayEnabled ?? false;
  const halfLifeMinutes = activeSession?.weightDecayHalfLifeMinutes ?? 60;
  const tippingEnabled = activeSession?.tippingEnabled !== false;
  const partnerDancesEnabled = activeSession?.partnerDancesEnabled !== false;
  const queueVisibleToRequesters = activeSession?.queueVisibleToRequesters !== false;
  const queueVisibleCount = activeSession?.queueVisibleCount ?? 4;
  const feedAspectRatio = activeSession?.feedAspectRatio ?? '16:9';
  const feedTemplateId = activeSession?.feedTemplateId ?? 'default';

  function openNewSession() {
    router.push('/start');
  }

  async function discardDraft() {
    const target = workingSession?.status === 'draft' ? workingSession : draftSession;
    if (!target) return;
    await fetch(`/api/dj/sessions/${target._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    });
    setSelectedSessionId(null);
    mutateSessions();
  }

  // onBeforeMutate lets index.js run plugin-specific teardown (e.g. pausing
  // Spotify playback) between the PATCH and the sessions revalidation.
  async function closeSession(onBeforeMutate) {
    const target = workingSession?.status === 'active' ? workingSession : activeSession;
    if (!target) return;
    await fetch(`/api/dj/sessions/${target._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    });
    if (onBeforeMutate) await onBeforeMutate();
    setSelectedSessionId(null);
    mutateSessions();
  }

  async function continueSession(id, onDone) {
    await fetch(`/api/dj/sessions/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    mutateSessions();
    if (onDone) await onDone();
  }

  async function togglePartnerDances() {
    if (!activeSession) return;
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partnerDancesEnabled: !activeSession.partnerDancesEnabled }),
    });
    mutateSessions();
  }

  async function toggleTipping() {
    if (!activeSession) return;
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tippingEnabled: activeSession.tippingEnabled === false }),
    });
    mutateSessions();
  }

  async function toggleWeighting() {
    if (!activeSession) return;
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fairnessScoringEnabled: !fairnessScoringEnabled }),
    });
    mutateSessions();
  }

  async function toggleQueueVisibility() {
    if (!activeSession) return;
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queueVisibleToRequesters: !queueVisibleToRequesters }),
    });
    mutateSessions();
  }

  async function setQueueVisibleCount(count) {
    if (!activeSession) return;
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queueVisibleCount: count }),
    });
    mutateSessions();
  }

  async function setFeedAspectRatio(ratio) {
    if (!activeSession) return;
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedAspectRatio: ratio }),
    });
    mutateSessions();
  }

  async function setFeedTemplateId(id) {
    if (!activeSession) return;
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedTemplateId: id }),
    });
    mutateSessions();
  }

  async function applyFeedTemplate() {
    if (!activeSession) return;
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedAppliedAt: new Date().toISOString() }),
    });
    mutateSessions();
  }

  async function cycleDecay() {
    if (!activeSession) return;
    const currentIdx = DECAY_OPTIONS.findIndex(p =>
      p.enabled === decayEnabled && (!p.enabled || p.minutes === halfLifeMinutes)
    );
    const next = DECAY_OPTIONS[(currentIdx + 1) % DECAY_OPTIONS.length];
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weightDecayEnabled: next.enabled, weightDecayHalfLifeMinutes: next.minutes }),
    });
    mutateSessions();
  }

  const decayLabel = DECAY_OPTIONS.find(p =>
    p.enabled === decayEnabled && (!p.enabled || p.minutes === halfLifeMinutes)
  )?.label ?? 'None';

  return {
    sessions, liveSessions, activeSession, draftSession, workingSession, isSpotify, mutateSessions,
    selectSession, openNewSession, closeSession, continueSession, discardDraft,
    togglePartnerDances, toggleTipping, toggleWeighting, cycleDecay,
    toggleQueueVisibility, setQueueVisibleCount,
    setFeedAspectRatio, setFeedTemplateId, applyFeedTemplate,
    tippingEnabled, partnerDancesEnabled, fairnessScoringEnabled, decayEnabled, halfLifeMinutes, decayLabel,
    queueVisibleToRequesters, queueVisibleCount, feedAspectRatio, feedTemplateId,
  };
}
