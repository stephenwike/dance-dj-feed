import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import styles from './dj-controller.module.css';
import { useRequestGroups } from '../../lib/client/dj/hooks/useRequestGroups';
import { useQueueReorder } from '../../lib/client/dj/hooks/useQueueReorder';
import { useStandardAutoAdvance } from '../../lib/client/dj/hooks/useStandardAutoAdvance';
import { useSessionManager } from '../../lib/client/dj/hooks/useSessionManager';
import { useAnnouncements } from '../../lib/client/dj/hooks/useAnnouncements';
import { useRequestActions } from '../../lib/client/dj/hooks/useRequestActions';
import { useSpotifyPlugin } from '../../lib/client/dj/plugins/useSpotifyPlugin';
import { SpotifyPanel, SpotifySearch } from '../../components/dj-controller/SpotifyComponents';
import SortableQueueItem from '../../components/dj-controller/SortableQueueItem';
import RemoteControl from '../../components/dj-controller/RemoteControl';
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
import PendingDanceGroup from '../../components/dj-controller/PendingDanceGroup';
import PendingRequesterGroup from '../../components/dj-controller/PendingRequesterGroup';
import SessionWarningBanner from '../../components/dj-controller/SessionWarningBanner';
import ExtendSessionModal from '../../components/dj-controller/ExtendSessionModal';
import useSessionTimeState from '../../lib/client/dj/hooks/useSessionTimeState';

const fetcher = url => fetch(url).then(r => r.json());

// ── Main Controller ───────────────────────────────────────────────────────────
function Controller() {
  const router = useRouter();
  const [pendingTab, setPendingTab] = useState('dances');
  const [pendingSort, setPendingSort] = useState('score');
  const [pendingFilter, setPendingFilter] = useState('all');
  const [editingGroup, setEditingGroup] = useState(null);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [activePanel, setActivePanel] = useState('requests');
  const [connectNotice, setConnectNotice] = useState('');

  const {
    sessions, liveSessions, activeSession, draftSession, workingSession, isSpotify, mutateSessions,
    selectSession, closeSession: closeSessionBase, continueSession: continueSessionBase, discardDraft,
    togglePartnerDances, toggleTipping, toggleWeighting, cycleDecay,
    toggleQueueVisibility, setQueueVisibleCount,
    setFeedAspectRatio, setFeedTemplateId,
    tippingEnabled, partnerDancesEnabled, fairnessScoringEnabled, decayEnabled, halfLifeMinutes, decayLabel,
    queueVisibleToRequesters, queueVisibleCount, feedAspectRatio, feedTemplateId,
  } = useSessionManager();

  const requestsUrl = workingSession?._id ? `/api/dj/requests?sessionId=${workingSession._id}` : '/api/dj/requests';
  const { data: rawRequests = [], mutate } = useSWR(requestsUrl, fetcher, {
    refreshInterval: 5000, revalidateOnFocus: true, dedupingInterval: 2000,
  });

  const {
    activeMsg,
    showMessagePanel: _showMsg, setShowMessagePanel,
    msgTab, setMsgTab,
    msgText, setMsgText,
    msgDuration, setMsgDuration,
    postMessage, clearMessage, addQueueMessage,
  } = useAnnouncements({ activeSession, mutateRequests: mutate });

  const spotify = useSpotifyPlugin({ isActive: isSpotify, rawRequests, mutate });

  const { timeState, countdown, isGrace } = useSessionTimeState(activeSession);

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
  const { data: stripeStatus } = useSWR('/api/dev/stripe-status', fetcher, {
    refreshInterval: 10000, shouldRetryOnError: false,
    onSuccess: (data) => { if (data?.active) setStripeDismissed(false); },
  });
  const stripeWarning = stripeStatus && !stripeStatus.active && !stripeDismissed;

  async function closeSession() {
    await closeSessionBase(isSpotify ? () => spotify.onCloseSession() : undefined);
    mutate();
  }

  async function continueSession(id) {
    await continueSessionBase(id, async () => { mutate(); setActivePanel('requests'); });
  }

  const {
    playing, queue, history,
    resolvedNames, danceRequestCounts, danceBeats, partnerUpvoteCounts,
    playsPerClient, danceGroups, requesterGroups, nextQueuePos,
  } = useRequestGroups({ rawRequests, fairnessScoringEnabled, decayEnabled, halfLifeMinutes });

  const playingItem = playing[0] ?? null;
  const queueTimes = useMemo(() => estimateQueueTimes(playing, queue), [playing, queue]);
  useStandardAutoAdvance({ isSpotify, playingItem, mutate });

  const { sensors, handleDragEnd } = useQueueReorder({ queue, mutate });

  const { handleAction, clearHistory, saveGroupEdit } = useRequestActions({
    rawRequests, queue, nextQueuePos, history, isSpotify, spotify, mutate,
  });

  const hasPartnerGroups = danceGroups.some(g => g.danceType === 'partner');

  const filteredDanceGroups = useMemo(() => {
    let groups = danceGroups;
    if (pendingFilter === 'line') groups = groups.filter(g => g.danceType !== 'partner');
    else if (pendingFilter === 'partner') groups = groups.filter(g => g.danceType === 'partner');
    if (pendingSort === 'alpha') groups = [...groups].sort((a, b) => (a.danceName || '').localeCompare(b.danceName || ''));
    return groups;
  }, [danceGroups, pendingFilter, pendingSort]);

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
          activeSession={activeSession}
          draftSession={draftSession}
          workingSession={workingSession}
          liveSessions={liveSessions}
          selectSession={selectSession}
          closeSession={closeSession}
          discardDraft={discardDraft}
          timeState={timeState}
          countdown={countdown}
        />
        <SessionWarningBanner
          timeState={timeState}
          countdown={countdown}
          onExtend={() => setShowExtendModal(true)}
        />
        {showExtendModal && activeSession && (
          <ExtendSessionModal
            sessionId={activeSession._id}
            onClose={() => setShowExtendModal(false)}
            onExtended={() => mutateSessions()}
          />
        )}

        <div className={styles.body}>
          <Sidebar
            activeSession={activeSession}
            activePanel={activePanel}
            onSetPanel={setActivePanel}
            activeMsg={activeMsg}
            pendingCount={pendingCount}
            isSpotify={isSpotify}
            spotifyConnected={spotify.connected}
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
                      {hasPartnerGroups && (
                        <div className={styles.filterGroup}>
                          <span className={styles.controlLabel}>Filter</span>
                          <div className={styles.filterChips}>
                            {['all', 'line', 'partner'].map(f => (
                              <button
                                key={f}
                                className={`${styles.filterChip} ${pendingFilter === f ? styles.filterChipActive : ''}`}
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
                          />
                        ))
                  )}
                </div>
              </div>
            )}

            {activePanel === 'messages' && (
              <MessagePanel
                activeSession={activeSession}
                msgTab={msgTab}
                setMsgTab={setMsgTab}
                msgText={msgText}
                setMsgText={setMsgText}
                msgDuration={msgDuration}
                setMsgDuration={setMsgDuration}
                activeMsg={activeMsg}
                clearMessage={clearMessage}
                postMessage={postMessage}
                addQueueMessage={addQueueMessage}
              />
            )}

            {activePanel === 'settings' && (
              <SettingsPanel
                activeSession={activeSession}
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
              />
            )}

            {activePanel === 'feed-config' && (
              <FeedConfigPanel
                activeSession={activeSession}
                feedAspectRatio={feedAspectRatio}
                feedTemplateId={feedTemplateId}
                setFeedAspectRatio={setFeedAspectRatio}
                setFeedTemplateId={setFeedTemplateId}
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
                onCloseSession={async (id) => { await closeSession(); setActivePanel('requests'); }}
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
                    history.map(r => (
                      <div key={r._id} className={styles.histRow} style={{ padding: '6px 14px' }}>
                        <span className={r.status === 'played' ? styles.histDot : styles.histDotSkip} />
                        <span className={styles.histName}>{r.danceName}</span>
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
                {isSpotify ? (
                  <SpotifyPanel
                    data={spotify.data}
                    onControl={spotify.handleControl}
                    connected={spotify.connected}
                    error={spotify.error}
                    onRetry={spotify.retry}
                  />
                ) : (
                  <RemoteControl playing={playing} queue={queue} onAction={handleAction} activeSession={activeSession} />
                )}

                {isSpotify && playing.length === 0 && queue.length > 0 && (
                  <button className={styles.remoteBtnStart} onClick={() => handleAction(queue[0]._id, 'startQueue')}>
                    ▶ Start Queue
                  </button>
                )}

                {isSpotify && playing.map(r => (
                  <div key={r._id} className={styles.qCard} style={{ borderColor: 'rgba(138,92,255,0.4)' }}>
                    <div className={styles.qInfo}>
                      <div className={styles.qName}>{r.danceName} <span className={styles.nowBadge}>NOW PLAYING</span></div>
                      {r.songName && <div className={styles.qSong}>{r.songName}{r.artist ? ` — ${r.artist}` : ''}</div>}
                    </div>
                    <div className={styles.qActions}>
                      <button className={styles.btnPlayed} onClick={() => handleAction(r._id, 'played')}>✓ Played</button>
                      <button className={styles.btnRemove} onClick={() => handleAction(r._id, 'remove')}>✕</button>
                    </div>
                  </div>
                ))}

                {!isSpotify && playing.length === 0 && queue.length === 0 && (
                  <div className={styles.queueEmpty}>
                    <span className={styles.queueEmptyIcon}>🎵</span>
                    <span className={styles.queueEmptyTitle}>Queue is empty</span>
                    <span className={styles.queueEmptyHint}>Approve requests from the Requests panel to add dances</span>
                  </div>
                )}
                {isSpotify && playing.length === 0 && queue.length === 0 && (
                  <p className={styles.empty}>Queue is empty.</p>
                )}

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={queue.map(r => r._id)} strategy={verticalListSortingStrategy}>
                    {queue.map(r => (
                      <SortableQueueItem key={r._id} id={r._id}>
                        {(dragHandleProps) => (
                          <QueueCard
                            request={r}
                            onAction={handleAction}
                            resolvedName={resolvedNames[r.clientId]}
                            dragHandleProps={dragHandleProps}
                            requesterCount={r.danceType === 'partner' ? 1 + (partnerUpvoteCounts[r._id] ?? 0) : (danceRequestCounts[(r.danceName || '').toLowerCase().trim()] ?? 1)}
                            totalBeats={r.danceType === 'partner' ? (danceBeats[r._id] ?? 0) : (danceBeats[(r.danceName || '').toLowerCase().trim()] ?? 0)}
                            estimatedPlayAt={queueTimes[r._id]}
                          />
                        )}
                      </SortableQueueItem>
                    ))}
                  </SortableContext>
                </DndContext>

                {isSpotify && <SpotifySearch onAdd={(track) => spotify.handleAdd(track, nextQueuePos)} />}
              </div>
            </div>
          </div>
        </div>
      </div>
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
