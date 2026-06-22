import { useRouter } from 'next/router';
import useSWR from 'swr';

const fetcher = url => fetch(url).then(r => r.json());

const DECAY_PRESETS = [
  { label: 'Decay Off', enabled: false, minutes: 60 },
  { label: '30m decay', enabled: true,  minutes: 30 },
  { label: '1h decay',  enabled: true,  minutes: 60 },
  { label: '2h decay',  enabled: true,  minutes: 120 },
];

/**
 * Session lifecycle (start/close/resume) and per-session settings
 * (partner dances, tipping, fairness decay).
 */
export function useSessionManager() {
  const router = useRouter();

  const { data: sessions = [], mutate: mutateSessions } = useSWR('/api/dj/sessions', fetcher, {
    refreshInterval: 30000, revalidateOnFocus: true,
  });
  const activeSession = sessions.find(s => s.status === 'active') ?? null;
  const isSpotify = activeSession?.plugin === 'spotify';
  const decayEnabled = activeSession?.weightDecayEnabled ?? false;
  const halfLifeMinutes = activeSession?.weightDecayHalfLifeMinutes ?? 60;
  const tippingEnabled = activeSession?.tippingEnabled !== false;
  const partnerDancesEnabled = activeSession?.partnerDancesEnabled !== false;

  function openNewSession() {
    router.push('/start');
  }

  // onBeforeMutate lets index.js run plugin-specific teardown (e.g. pausing
  // Spotify playback) between the PATCH and the sessions revalidation.
  async function closeSession(onBeforeMutate) {
    if (!activeSession) return;
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    });
    if (onBeforeMutate) await onBeforeMutate();
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

  async function cycleDecay() {
    if (!activeSession) return;
    const currentIdx = DECAY_PRESETS.findIndex(p =>
      p.enabled === decayEnabled && (!p.enabled || p.minutes === halfLifeMinutes)
    );
    const next = DECAY_PRESETS[(currentIdx + 1) % DECAY_PRESETS.length];
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weightDecayEnabled: next.enabled, weightDecayHalfLifeMinutes: next.minutes }),
    });
    mutateSessions();
  }

  const currentDecayLabel = DECAY_PRESETS.find(p =>
    p.enabled === decayEnabled && (!p.enabled || p.minutes === halfLifeMinutes)
  )?.label ?? 'Decay Off';

  return {
    sessions, activeSession, isSpotify, mutateSessions,
    openNewSession, closeSession, continueSession,
    togglePartnerDances, toggleTipping, cycleDecay,
    tippingEnabled, partnerDancesEnabled, decayEnabled, halfLifeMinutes, currentDecayLabel,
  };
}
