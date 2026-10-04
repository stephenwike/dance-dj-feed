import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { useRequestGroups } from '../../lib/client/dj/hooks/useRequestGroups';
import { effectivePendingFilter, filterPendingGroups } from '../../lib/client/dj/pendingGroups';
import { useQueueReorder } from '../../lib/client/dj/hooks/useQueueReorder';
import { useStandardAutoAdvance } from '../../lib/client/dj/hooks/useStandardAutoAdvance';
import { useSessionManager } from '../../lib/client/dj/hooks/useSessionManager';
import { useAnnouncements } from '../../lib/client/dj/hooks/useAnnouncements';
import { useRequestActions } from '../../lib/client/dj/hooks/useRequestActions';
import { useNotifications } from '../../lib/client/dj/hooks/useNotifications';
import useSessionTimeState from '../../lib/client/dj/hooks/useSessionTimeState';
import { getPlugin } from './plugins/registry';
import { usePluginRuntime } from './plugins/usePluginRuntime';
import { StandardAdapter } from '../../lib/client/dj/controllerAdapters';
import { estimateQueueTimes } from './utils';
import { fetcher } from '../../lib/client/fetcher';

// Suppressed requesters' pending requests are hidden; approved ones stay (see /api/dj/requests).
const SUPPRESS_STATUSES = new Set(['pending']);

// The Stripe CLI health banner is a local-development aid only.
const STRIPE_STATUS_URL = process.env.NODE_ENV === 'development' ? '/api/dev/stripe-status' : null;

const pendingName = g => (g.danceType === 'partner'
  ? (g.songName || g.partnerStyle || g.danceName || '')
  : (g.danceName || g.songName || ''));

/**
 * Everything the DJ controller knows and can do — sessions, requests, the
 * queue, announcements, notifications, the playback plugin — independent of
 * layout. The desktop and phone layouts both render from this, so they can
 * never disagree about the state of the event.
 *
 * Layout-only state (which panel or tab is open) stays in the layouts.
 * `focusPanel` asks a layout to open a panel (e.g. 'wallet' after returning
 * from payout onboarding); `clearFocusPanel` acknowledges it.
 */
export function useController() {
  const router = useRouter();

  // ── Sessions ───────────────────────────────────────────────────────────────
  const sessionManager = useSessionManager();
  const {
    workingSession, mutateSessions, pluginId, setPlugin,
    closeSession: closeSessionBase, continueSession: continueSessionBase,
    fairnessScoringEnabled, decayEnabled, halfLifeMinutes,
  } = sessionManager;
  // The selected session, when it is live (drafts can be configured and
  // pre-loaded, but not played or announced to).
  const liveSession = workingSession?.status === 'active' ? workingSession : null;
  const { timeState, countdown, isGrace } = useSessionTimeState(liveSession);
  const [showExtendModal, setShowExtendModal] = useState(false);

  // ── Requests ───────────────────────────────────────────────────────────────
  const requestsUrl = workingSession?._id ? `/api/dj/requests?sessionId=${workingSession._id}` : '/api/dj/requests';
  const { data: rawRequests = [], mutate } = useSWR(requestsUrl, fetcher, {
    refreshInterval: 5000, revalidateOnFocus: true, dedupingInterval: 2000,
  });

  const requestersUrl = workingSession?._id ? `/api/dj/requesters?sessionId=${workingSession._id}` : null;
  const { data: requestersData } = useSWR(requestersUrl, fetcher, {
    refreshInterval: 15000, revalidateOnFocus: false,
  });
  const nicknameOverrides = useMemo(() => {
    if (!requestersData?.requesters) return {};
    return Object.fromEntries(
      requestersData.requesters.filter(r => r.nickname).map(r => [r.clientId, r.nickname])
    );
  }, [requestersData]);

  // Filter out suppressed requesters from the pending/queue display
  const suppressedSet = useMemo(
    () => new Set(workingSession?.suppressedClientIds ?? []),
    [workingSession?.suppressedClientIds]
  );
  const visibleRequests = useMemo(
    () => suppressedSet.size > 0
      ? rawRequests.filter(r => !suppressedSet.has(r.clientId) || !SUPPRESS_STATUSES.has(r.status))
      : rawRequests,
    [rawRequests, suppressedSet]
  );

  const groups = useRequestGroups({
    rawRequests: visibleRequests, allRequests: rawRequests,
    fairnessScoringEnabled, decayEnabled, halfLifeMinutes, nicknameOverrides,
  });
  const { playing, queue, history, danceGroups, nextQueuePos } = groups;

  // Pending-requests view (shared: both layouts show the same list).
  const [pendingTab, setPendingTab] = useState('dances');
  const [pendingSort, setPendingSort] = useState('score');
  const [pendingFilter, setPendingFilter] = useState('all');
  // A filter left on e.g. 'partner' after the last partner request was queued
  // falls back to 'all' (see effectivePendingFilter).
  const { showFilter, filter: activeFilter } = effectivePendingFilter(danceGroups, pendingFilter);
  const filteredDanceGroups = useMemo(() => {
    const filtered = filterPendingGroups(danceGroups, activeFilter);
    return pendingSort === 'alpha'
      ? [...filtered].sort((a, b) => pendingName(a).localeCompare(pendingName(b)))
      : filtered;
  }, [danceGroups, activeFilter, pendingSort]);
  const [editingGroup, setEditingGroup] = useState(null);

  async function toggleSuppress(clientId, suppress) {
    if (!workingSession?._id) return;
    await fetch('/api/dj/requesters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: String(workingSession._id), clientId, suppress }),
    });
    mutateSessions();
  }

  // ── Announcements & notifications ──────────────────────────────────────────
  const announcements = useAnnouncements({ session: liveSession, mutateRequests: mutate });
  const notifs = useNotifications();

  // Tip toasts: one at a time, auto-dismissed after two minutes.
  const [toastQueue, setToastQueue] = useState([]);
  const toastedIds = useRef(new Set());
  useEffect(() => {
    const newOnes = notifs.notifications.filter(n => !n.read && !toastedIds.current.has(n._id));
    if (newOnes.length === 0) return;
    for (const n of newOnes) toastedIds.current.add(n._id);
    setToastQueue(q => [...q, ...newOnes]);
  }, [notifs.notifications]);
  const dismissToast = id => setToastQueue(q => q.filter(n => n._id !== id));
  async function markSeenFromToast(id) {
    await notifs.markRead(id);
    dismissToast(id);
  }
  useEffect(() => {
    if (toastQueue.length === 0) return;
    const timer = setTimeout(() => dismissToast(toastQueue[0]._id), 120000);
    return () => clearTimeout(timer);
  }, [toastQueue]);

  // ── Playback plugin & queue ────────────────────────────────────────────────
  const plugin = getPlugin(pluginId);
  const pluginRuntime = usePluginRuntime(pluginId, { sessionId: liveSession?._id, rawRequests, mutate });

  const playingItem = playing[0] ?? null;
  const queueTimes = useMemo(() => estimateQueueTimes(playing, queue), [playing, queue]);
  useStandardAutoAdvance({ enabled: plugin.adapter === StandardAdapter, playingItem, mutate, sessionId: liveSession?._id });

  const reorder = useQueueReorder({ queue, mutate });
  const { handleAction, clearHistory, saveGroupEdit } = useRequestActions({
    rawRequests, queue, nextQueuePos, history, adapter: plugin.adapter, runtime: pluginRuntime, mutate,
  });

  // What every plugin slot component can see and do (see PluginSlot.js).
  const pluginController = { session: liveSession, playing, queue, nextQueuePos, onAction: handleAction, setPlugin };
  // What the plugin says about a queued/now-playing card: its border tint.
  const itemTone = request => plugin.itemTone?.(pluginRuntime, request) ?? null;

  async function closeSession(id) {
    await closeSessionBase({ id, onBeforeMutate: pluginRuntime.onCloseSession });
    mutate();
  }
  async function continueSession(id, onDone) {
    await continueSessionBase(id, async () => { mutate(); await onDone?.(); });
  }

  // ── Returning from Stripe (session extension, payout onboarding) ───────────
  const [connectNotice, setConnectNotice] = useState('');
  const [focusPanel, setFocusPanel] = useState(null);
  useEffect(() => {
    if (router.query.extension_success) {
      window.history.replaceState({}, '', '/dj-controller');
      mutateSessions();
    }
    if (router.query.connect_success) {
      window.history.replaceState({}, '', '/dj-controller');
      setConnectNotice('Payout account connected! It may take a moment to verify.');
      setFocusPanel('wallet');
    }
    if (router.query.connect_refresh) {
      window.history.replaceState({}, '', '/dj-controller');
      setConnectNotice('Please complete your payout account setup.');
      setFocusPanel('wallet');
    }
  }, [router.query.extension_success, router.query.connect_success, router.query.connect_refresh]);

  const [stripeDismissed, setStripeDismissed] = useState(false);
  const { data: stripeStatus } = useSWR(STRIPE_STATUS_URL, fetcher, {
    refreshInterval: 10000, shouldRetryOnError: false,
    onSuccess: (data) => { if (data?.active) setStripeDismissed(false); },
  });
  const stripeWarning = stripeStatus && !stripeStatus.active && !stripeDismissed;

  return {
    // sessions
    ...sessionManager,
    liveSession, timeState, countdown, isGrace,
    showExtendModal, setShowExtendModal,
    closeSession, continueSession,
    // requests & queue
    rawRequests, mutate, suppressedSet, toggleSuppress,
    ...groups,
    playingItem, queueTimes, reorder,
    handleAction, clearHistory, saveGroupEdit,
    editingGroup, setEditingGroup,
    pendingTab, setPendingTab, pendingSort, setPendingSort, setPendingFilter,
    showFilter, activeFilter, filteredDanceGroups, pendingCount: danceGroups.length,
    // announcements & notifications
    announcements,
    ...notifs,
    toastQueue, dismissToast, markSeenFromToast,
    // playback plugin
    plugin, pluginRuntime, pluginController, itemTone,
    // misc
    connectNotice, focusPanel, clearFocusPanel: () => setFocusPanel(null),
    stripeWarning, dismissStripeWarning: () => setStripeDismissed(true),
  };
}
