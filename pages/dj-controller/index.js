import { useState, useEffect, useRef, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import styles from './dj-controller.module.css';
import { useRequestGroups } from '../../lib/client/dj/hooks/useRequestGroups';
import { effectivePendingFilter, filterPendingGroups } from '../../lib/client/dj/pendingGroups';
import { useQueueReorder } from '../../lib/client/dj/hooks/useQueueReorder';
import { useStandardAutoAdvance } from '../../lib/client/dj/hooks/useStandardAutoAdvance';
import { useSessionManager } from '../../lib/client/dj/hooks/useSessionManager';
import { useAnnouncements } from '../../lib/client/dj/hooks/useAnnouncements';
import { useRequestActions } from '../../lib/client/dj/hooks/useRequestActions';
import { getPlugin } from '../../components/dj-controller/plugins/registry';
import { usePluginRuntime } from '../../components/dj-controller/plugins/usePluginRuntime';
import PluginSlot, { SLOTS, hasSlot } from '../../components/dj-controller/plugins/PluginSlot';
import { StandardAdapter } from '../../lib/client/dj/controllerAdapters';
import SortableQueueItem from '../../components/dj-controller/SortableQueueItem';
import RemoteControl from '../../components/dj-controller/RemoteControl';
import FloorRemote from '../../components/dj-controller/FloorRemote';
import QueueCard from '../../components/dj-controller/QueueCard';
import { timeAgo, estimateQueueTimes } from '../../components/dj-controller/utils';
import SessionsPanel from '../../components/dj-controller/SessionsPanel';
import DJAddPanel from '../../components/dj-controller/DJAddPanel';
import CustomEditModal from '../../components/dj-controller/CustomEditModal';
import TopBar from '../../components/dj-controller/TopBar';
import Sidebar from '../../components/dj-controller/Sidebar';
import SettingsPanel from '../../components/dj-controller/SettingsPanel';
import MessagePanel from '../../components/dj-controller/MessagePanel';
import FeedConfigPanel from '../../components/dj-controller/FeedConfigPanel';
import WalletPanel from '../../components/dj-controller/WalletPanel';
import NotificationsPanel from '../../components/dj-controller/NotificationsPanel';
import RequestersPanel from '../../components/dj-controller/RequestersPanel';
import { useNotifications } from '../../lib/client/dj/hooks/useNotifications';
import PendingDanceGroup from '../../components/dj-controller/PendingDanceGroup';
import PendingRequesterGroup from '../../components/dj-controller/PendingRequesterGroup';
import SessionWarningBanner from '../../components/dj-controller/SessionWarningBanner';
import ExtendSessionModal from '../../components/dj-controller/ExtendSessionModal';
import useSessionTimeState from '../../lib/client/dj/hooks/useSessionTimeState';
import { fetcher } from '../../lib/client/fetcher';

// Suppressed requesters' pending requests are hidden; approved ones stay (see /api/dj/requests).
const SUPPRESS_STATUSES = new Set(['pending']);

// The Stripe CLI health banner is a local-development aid only.
const STRIPE_STATUS_URL = process.env.NODE_ENV === 'development' ? '/api/dev/stripe-status' : null;

const historyName = r => r.danceType === 'partner'
  ? (r.songName || r.partnerStyle || r.danceName || 'Partner Dance')
  : (r.danceName || '');

// Collapse repeat entries of the same dance played within 5 minutes of each
// other (e.g. several requests for one play that were marked individually).
function dedupeHistory(history) {
  const lastSeen = {};
  return history.filter(r => {
    const key = historyName(r).toLowerCase().trim();
    const t = new Date(r.updatedAt).getTime();
    if (lastSeen[key] !== undefined && Math.abs(t - lastSeen[key]) < 5 * 60 * 1000) return false;
    lastSeen[key] = t;
    return true;
  });
}

// Matches the phone breakpoint in dj-controller.module.css.
const PHONE_QUERY = '(max-width: 640px)';

// ── Main Controller ───────────────────────────────────────────────────────────
function Controller() {
  const router = useRouter();
  const [pendingTab, setPendingTab] = useState('dances');
  const [pendingSort, setPendingSort] = useState('score');
  const [pendingFilter, setPendingFilter] = useState('all');
  const [editingGroup, setEditingGroup] = useState(null);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [activePanel, setActivePanel] = useState('requests');
  // Phones show one column at a time ('queue' or the sidebar's 'panel'), and
  // open on the Floor Remote — the controls the DJ needs on the dance floor.
  const [mobileView, setMobileView] = useState('queue');
  const [remoteOpen, setRemoteOpen] = useState(false);
  useEffect(() => {
    if (window.matchMedia(PHONE_QUERY).matches) setRemoteOpen(true);
  }, []);
  function showPanel(id) {
    setActivePanel(id);
    setMobileView('panel');
  }
  const [connectNotice, setConnectNotice] = useState('');

  const {
    sessions, liveSessions, workingSession, pluginId, setPlugin, mutateSessions,
    selectSession, closeSession: closeSessionBase, continueSession: continueSessionBase, discardDraft,
    togglePartnerDances, toggleTipping, toggleRequestsEnabled, toggleWeighting, cycleDecay,
    toggleQueueVisibility, setQueueVisibleCount,
    setFeedAspectRatio, setFeedTemplateId, applyFeedTemplate,
    tippingEnabled, partnerDancesEnabled, requestsEnabled, fairnessScoringEnabled, decayEnabled, halfLifeMinutes, decayLabel,
    queueVisibleToRequesters, queueVisibleCount, feedAspectRatio, feedTemplateId,
  } = useSessionManager();
  // The selected session, when it is live (drafts can be configured and
  // pre-loaded, but not played or announced to).
  const liveSession = workingSession?.status === 'active' ? workingSession : null;

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

  const {
    activeMsg,
    showMessagePanel: _showMsg, setShowMessagePanel,
    msgTab, setMsgTab,
    msgText, setMsgText,
    msgDuration, setMsgDuration,
    sendToAll, setSendToAll,
    postMessage, clearMessage, addQueueMessage,
  } = useAnnouncements({ session: liveSession, mutateRequests: mutate });

  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  // Toast state: array of notification objects to show
  const [toastQueue, setToastQueue] = useState([]);
  const toastedIds = useRef(new Set());

  useEffect(() => {
    const newOnes = notifications.filter(n => !n.read && !toastedIds.current.has(n._id));
    if (newOnes.length === 0) return;
    for (const n of newOnes) toastedIds.current.add(n._id);
    setToastQueue(q => [...q, ...newOnes]);
  }, [notifications]);

  function dismissToast(id) {
    setToastQueue(q => q.filter(n => n._id !== id));
  }

  async function markSeenFromToast(id) {
    await markRead(id);
    dismissToast(id);
  }

  // Auto-dismiss toast after 120 seconds
  useEffect(() => {
    if (toastQueue.length === 0) return;
    const oldest = toastQueue[0];
    const timer = setTimeout(() => dismissToast(oldest._id), 120000);
    return () => clearTimeout(timer);
  }, [toastQueue]);

  // Mark all notifications read when navigating away from the notifications panel
  const prevPanel = useRef(activePanel);
  useEffect(() => {
    if (prevPanel.current === 'notifications' && activePanel !== 'notifications' && unreadCount > 0) {
      markAllRead();
    }
    prevPanel.current = activePanel;
  }, [activePanel]);

  const plugin = getPlugin(pluginId);
  const pluginRuntime = usePluginRuntime(pluginId, { sessionId: liveSession?._id, rawRequests, mutate });

  const { timeState, countdown, isGrace } = useSessionTimeState(liveSession);

  useEffect(() => {
    if (router.query.extension_success) {
      window.history.replaceState({}, '', '/dj-controller');
      mutateSessions();
    }
    if (router.query.connect_success) {
      window.history.replaceState({}, '', '/dj-controller');
      setConnectNotice('Payout account connected! It may take a moment to verify.');
      setActivePanel('wallet');
    }
    if (router.query.connect_refresh) {
      window.history.replaceState({}, '', '/dj-controller');
      setConnectNotice('Please complete your payout account setup.');
      setActivePanel('wallet');
    }
  }, [router.query.extension_success, router.query.connect_success, router.query.connect_refresh]);

  const [stripeDismissed, setStripeDismissed] = useState(false);
  const { data: stripeStatus } = useSWR(STRIPE_STATUS_URL, fetcher, {
    refreshInterval: 10000, shouldRetryOnError: false,
    onSuccess: (data) => { if (data?.active) setStripeDismissed(false); },
  });
  const stripeWarning = stripeStatus && !stripeStatus.active && !stripeDismissed;

  async function closeSession(id) {
    await closeSessionBase({ id, onBeforeMutate: pluginRuntime.onCloseSession });
    mutate();
  }

  async function continueSession(id) {
    await continueSessionBase(id, async () => { mutate(); setActivePanel('requests'); });
  }

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

  const {
    playing, queue, history,
    resolvedNames, statsFor,
    playsPerClient, danceGroups, requesterGroups, nextQueuePos,
  } = useRequestGroups({ rawRequests: visibleRequests, allRequests: rawRequests, fairnessScoringEnabled, decayEnabled, halfLifeMinutes, nicknameOverrides });

  const playingItem = playing[0] ?? null;
  const queueTimes = useMemo(() => estimateQueueTimes(playing, queue), [playing, queue]);
  useStandardAutoAdvance({ enabled: plugin.adapter === StandardAdapter, playingItem, mutate, sessionId: liveSession?._id });

  const { sensors, handleDragEnd } = useQueueReorder({ queue, mutate });

  const { handleAction, clearHistory, saveGroupEdit } = useRequestActions({
    rawRequests, queue, nextQueuePos, history, adapter: plugin.adapter, runtime: pluginRuntime, mutate,
  });

  // What every plugin slot component can see and do (see PluginSlot.js).
  const pluginController = { session: liveSession, playing, queue, nextQueuePos, onAction: handleAction, setPlugin };
  const pluginSlot = (name, fallback = null, extra = {}) => hasSlot(plugin, name)
    ? <PluginSlot plugin={plugin} name={name} runtime={pluginRuntime} controller={pluginController} {...extra} />
    : fallback;
  // What the plugin shows on each queued/now-playing card, and its border tint.
  const itemSlot = request => pluginSlot(SLOTS.QUEUE_ITEM, null, { request });
  const itemTone = request => plugin.itemTone?.(pluginRuntime, request) ?? null;

  async function toggleSuppress(clientId, suppress) {
    if (!workingSession?._id) return;
    await fetch('/api/dj/requesters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: String(workingSession._id), clientId, suppress }),
    });
    mutateSessions();
  }

  // A filter left on e.g. 'partner' after the last partner request was queued
  // falls back to 'all' (see effectivePendingFilter).
  const { showFilter, filter: activeFilter } = effectivePendingFilter(danceGroups, pendingFilter);

  const filteredDanceGroups = useMemo(() => {
    let groups = filterPendingGroups(danceGroups, activeFilter);
    if (pendingSort === 'alpha') groups = [...groups].sort((a, b) => {
      const nameOf = g => g.danceType === 'partner'
        ? (g.songName || g.partnerStyle || g.danceName || '')
        : (g.danceName || g.songName || '');
      return nameOf(a).localeCompare(nameOf(b));
    });
    return groups;
  }, [danceGroups, activeFilter, pendingSort]);

  const pendingCount = danceGroups.length;

  return (
    <>
      {editingGroup && (
        <CustomEditModal
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onSave={saveGroupEdit}
        />
      )}

      <div className={styles.page}>
        {stripeWarning && (
          <div className={styles.stripeBanner}>
            ⚡ Stripe listener not running — payments won&apos;t confirm. Run <code>npm run stripe</code> in a separate terminal.
            <button className={styles.stripeBannerDismiss} onClick={() => setStripeDismissed(true)}>✕</button>
          </div>
        )}
        <TopBar
          workingSession={workingSession}
          liveSessions={liveSessions}
          selectSession={selectSession}
          closeSession={() => closeSession()}
          discardDraft={discardDraft}
          timeState={timeState}
          countdown={countdown}
        />
        <SessionWarningBanner
          timeState={timeState}
          countdown={countdown}
          onExtend={() => setShowExtendModal(true)}
        />
        {showExtendModal && liveSession && (
          <ExtendSessionModal
            sessionId={liveSession._id}
            onClose={() => setShowExtendModal(false)}
            onExtended={() => mutateSessions()}
          />
        )}

        <div className={`${styles.body} ${mobileView === 'queue' ? styles.mobileShowQueue : styles.mobileShowPanel}`}>
          {pluginSlot(SLOTS.OVERLAY)}
          <Sidebar
            activeSession={liveSession}
            activePanel={activePanel}
            onSetPanel={showPanel}
            mobileView={mobileView}
            onShowQueue={() => setMobileView('queue')}
            onOpenRemote={() => setRemoteOpen(true)}
            activeMsg={activeMsg}
            pendingCount={pendingCount}
            unreadNotifCount={unreadCount}
            pluginStatus={pluginSlot(SLOTS.SIDEBAR_STATUS)}
          />

          {/* ── Left panel (swappable) ── */}
          <div className={`${styles.leftPanel} ${isGrace ? styles.frozen : ''}`}>
            {activePanel === 'requests' && (
              <div className={styles.panel}>
                <div className={styles.panelHead}>
                  <div className={styles.segControl}>
                    <button
                      className={`${styles.seg} ${pendingTab === 'dances' ? styles.segActive : ''}`}
                      onClick={() => setPendingTab('dances')}
                    >
                      By Dance {danceGroups.length > 0 && <span className={styles.segBadge}>{danceGroups.length}</span>}
                    </button>
                    <button
                      className={`${styles.seg} ${pendingTab === 'requesters' ? styles.segActive : ''}`}
                      onClick={() => setPendingTab('requesters')}
                    >
                      By Requester
                    </button>
                  </div>
                </div>
                <div className={styles.panelBody}>
                  {pendingTab === 'dances' && danceGroups.length > 0 && (
                    <div className={styles.pendingControls}>
                      {showFilter && (
                        <div className={styles.filterGroup}>
                          <span className={styles.controlLabel}>Filter</span>
                          <div className={styles.filterChips}>
                            {['all', 'line', 'partner'].map(f => (
                              <button
                                key={f}
                                className={`${styles.filterChip} ${activeFilter === f ? styles.filterChipActive : ''}`}
                                onClick={() => setPendingFilter(f)}
                              >
                                {f === 'all' ? 'All' : f === 'line' ? 'Line' : 'Partner'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className={styles.sortGroup}>
                        <span className={styles.controlLabel}>Sort</span>
                        <button
                          className={`${styles.sortBtn} ${pendingSort === 'alpha' ? styles.sortBtnActive : ''}`}
                          onClick={() => setPendingSort(s => s === 'score' ? 'alpha' : 'score')}
                        >
                          {pendingSort === 'alpha' ? 'A–Z' : 'Score'}
                        </button>
                      </div>
                    </div>
                  )}
                  {pendingTab === 'dances' && (
                    filteredDanceGroups.length === 0
                      ? <p className={styles.empty}>{danceGroups.length === 0 ? 'No pending requests yet.' : 'No requests match this filter.'}</p>
                      : filteredDanceGroups.map(group => (
                          <PendingDanceGroup
                            key={group.key}
                            group={group}
                            playsPerClient={playsPerClient}
                            resolvedNames={resolvedNames}
                            onAction={handleAction}
                            onEdit={setEditingGroup}
                          />
                        ))
                  )}
                  {pendingTab === 'requesters' && (
                    requesterGroups.length === 0
                      ? <p className={styles.empty}>No requests yet.</p>
                      : requesterGroups.map(group => (
                          <PendingRequesterGroup
                            key={group.key}
                            group={group}
                            playsPerClient={playsPerClient}
                            suppressedSet={suppressedSet}
                            onToggleSuppress={toggleSuppress}
                          />
                        ))
                  )}
                </div>
              </div>
            )}

            {activePanel === 'requesters' && (
              <RequestersPanel
                workingSession={workingSession}
                mutateSessions={mutateSessions}
              />
            )}

            {activePanel === 'messages' && (
              <MessagePanel
                activeSession={liveSession}
                msgTab={msgTab}
                setMsgTab={setMsgTab}
                msgText={msgText}
                setMsgText={setMsgText}
                msgDuration={msgDuration}
                setMsgDuration={setMsgDuration}
                sendToAll={sendToAll}
                setSendToAll={setSendToAll}
                activeMsg={activeMsg}
                clearMessage={clearMessage}
                postMessage={postMessage}
                addQueueMessage={addQueueMessage}
              />
            )}

            {activePanel === 'notifications' && (
              <NotificationsPanel
                notifications={notifications}
                unreadCount={unreadCount}
                markRead={markRead}
                markAllRead={markAllRead}
              />
            )}

            {activePanel === 'settings' && (
              <SettingsPanel
                activeSession={workingSession}
                requestsEnabled={requestsEnabled}
                toggleRequestsEnabled={toggleRequestsEnabled}
                partnerDancesEnabled={partnerDancesEnabled}
                togglePartnerDances={togglePartnerDances}
                tippingEnabled={tippingEnabled}
                toggleTipping={toggleTipping}
                fairnessScoringEnabled={fairnessScoringEnabled}
                toggleWeighting={toggleWeighting}
                cycleDecay={cycleDecay}
                decayLabel={decayLabel}
                queueVisibleToRequesters={queueVisibleToRequesters}
                toggleQueueVisibility={toggleQueueVisibility}
                queueVisibleCount={queueVisibleCount}
                setQueueVisibleCount={setQueueVisibleCount}
                pluginId={plugin.id}
                setPlugin={setPlugin}
                pluginLocked={playing.length > 0}
              />
            )}

            {activePanel === 'feed-config' && (
              <FeedConfigPanel
                activeSession={workingSession}
                feedAspectRatio={feedAspectRatio}
                feedTemplateId={feedTemplateId}
                setFeedAspectRatio={setFeedAspectRatio}
                setFeedTemplateId={setFeedTemplateId}
                applyFeedTemplate={applyFeedTemplate}
              />
            )}

            {activePanel === 'wallet' && (
              <WalletPanel connectNotice={connectNotice} />
            )}

            {activePanel === 'dj-add' && (
              <DJAddPanel
                activeSession={workingSession}
                nextQueuePos={nextQueuePos}
                mutate={mutate}
              />
            )}

            {activePanel === 'sessions' && (
              <SessionsPanel
                sessions={sessions}
                onContinue={continueSession}
                onCloseSession={async (id) => { await closeSession(id); setActivePanel('requests'); }}
              />
            )}

            {activePanel === 'history' && (
              <div className={styles.panel}>
                <div className={styles.panelHead}>
                  <span className={styles.panelTitle}>Track History</span>
                  {history.length > 0 && <span className={styles.colCount}>{history.length}</span>}
                  {history.length > 0 && (
                    <button className={styles.clearHistBtn} style={{ marginLeft: 'auto' }} onClick={clearHistory}>
                      Clear
                    </button>
                  )}
                </div>
                <div className={styles.panelBody} style={{ padding: 0 }}>
                  {/* Current session tracks */}
                  {history.length === 0 ? (
                    <p className={styles.empty} style={{ padding: '12px 14px' }}>No tracks played yet this session.</p>
                  ) : (
                    dedupeHistory(history).map(r => (
                      <div key={r._id} className={styles.histRow} style={{ padding: '6px 14px' }}>
                        <span className={styles.histDot} />
                        <span className={styles.histName}>{historyName(r)}</span>
                        {r.danceType === 'partner' && <span className={styles.partnerBadge}>Partner</span>}
                        <span className={styles.histAge}>{(() => { const t = timeAgo(r.updatedAt); return t === 'just now' ? t : `${t} ago`; })()}</span>
                      </div>
                    ))
                  )}

                </div>
              </div>
            )}
          </div>

          {/* ── Right panel (permanent queue) ── */}
          <div className={`${styles.rightPanel} ${isGrace ? styles.frozen : ''}`}>
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <span className={styles.panelTitle}>Queue</span>
                {queue.length > 0 && <span className={styles.colCount}>{queue.length}</span>}
              </div>
              <div className={styles.panelBody}>
                {pluginSlot(SLOTS.QUEUE_HEADER)}

                {pluginSlot(SLOTS.PLAYER, (
                  <>
                    <RemoteControl
                      playing={playing} queue={queue} onAction={handleAction} activeSession={liveSession}
                      stats={statsFor(playing[0])}
                      tone={playing[0] ? itemTone(playing[0]) : null}
                      footer={playing[0] ? itemSlot(playing[0]) : null}
                    />
                    {playing.length === 0 && queue.length === 0 && (
                      <div className={styles.queueEmpty}>
                        <span className={styles.queueEmptyIcon}>🎵</span>
                        <span className={styles.queueEmptyTitle}>Queue is empty</span>
                        <span className={styles.queueEmptyHint}>Approve requests from the Requests panel to add dances</span>
                      </div>
                    )}
                  </>
                ))}

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={queue.map(r => r._id)} strategy={verticalListSortingStrategy}>
                    {queue.map(r => {
                      const stats = statsFor(r);
                      return (
                      <SortableQueueItem key={r._id} id={r._id}>
                        {(dragHandleProps) => (
                          <QueueCard
                            request={r}
                            onAction={handleAction}
                            onEdit={(req) => setEditingGroup({ requests: [req], danceName: req.danceName, difficulty: req.difficulty || '' })}
                            resolvedName={resolvedNames[r.clientId]}
                            dragHandleProps={dragHandleProps}
                            requesterCount={stats.count || 1}
                            totalBeats={stats.beats}
                            estimatedPlayAt={queueTimes[r._id]}
                            score={stats.score}
                            tone={itemTone(r)}
                            footer={itemSlot(r)}
                          />
                        )}
                      </SortableQueueItem>
                      );
                    })}
                  </SortableContext>
                </DndContext>

                {pluginSlot(SLOTS.QUEUE_FOOTER)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Phones: always one tap back to the Floor Remote. */}
      {!remoteOpen && (
        <button className={styles.remoteFab} onClick={() => setRemoteOpen(true)}>
          🎛️ Floor Remote
        </button>
      )}

      {remoteOpen && (
        <FloorRemote
          session={liveSession}
          playing={playing}
          queue={queue}
          onAction={handleAction}
          onClose={() => setRemoteOpen(false)}
        >
          {pluginSlot(SLOTS.REMOTE_CONTROLS)}
        </FloorRemote>
      )}

      {/* ── Tip toast notifications ── */}
      {toastQueue.length > 0 && (() => {
        const n = toastQueue[0];
        const who = n.senderName || n.senderEmail || 'Someone';
        return (
          <div className={styles.tipToast}>
            <span className={styles.tipToastIcon}>💰</span>
            <div className={styles.tipToastContent}>
              <span className={styles.tipToastTitle}>Direct Tip Received!</span>
              <span className={styles.tipToastBody}>{who} sent ${(n.amountCents / 100).toFixed(2)}</span>
            </div>
            <button className={styles.tipToastSeen} onClick={() => markSeenFromToast(n._id)} title="Mark as seen">
              ✓
            </button>
          </div>
        );
      })()}
    </>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────
export default function DJControllerPage() {
  return (
    <>
      <Head><title>DJ Controller</title></Head>
      <Controller />
    </>
  );
}
