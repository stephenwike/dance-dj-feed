import { useState } from 'react';
import Head from 'next/head';
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
import { timeAgo } from '../../components/dj-controller/utils';
import PendingCard from '../../components/dj-controller/PendingCard';
import SessionsPanel from '../../components/dj-controller/SessionsPanel';
import CustomEditModal from '../../components/dj-controller/CustomEditModal';
import TopBar from '../../components/dj-controller/TopBar';
import ControlStrip from '../../components/dj-controller/ControlStrip';
import MessagePanel from '../../components/dj-controller/MessagePanel';
import PendingDanceGroup from '../../components/dj-controller/PendingDanceGroup';
import PendingRequesterGroup from '../../components/dj-controller/PendingRequesterGroup';

const fetcher = url => fetch(url).then(r => r.json());

// ── Main Controller ───────────────────────────────────────────────────────────
function Controller() {
  const [pendingTab, setPendingTab] = useState('dances');
  const [showSessions, setShowSessions] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  const {
    sessions, activeSession, isSpotify, mutateSessions,
    openNewSession, closeSession: closeSessionBase, continueSession: continueSessionBase,
    togglePartnerDances, toggleTipping, cycleDecay,
    tippingEnabled, partnerDancesEnabled, decayEnabled, halfLifeMinutes, currentDecayLabel,
  } = useSessionManager();

  const { data: rawRequests = [], mutate } = useSWR('/api/dj/requests', fetcher, {
    refreshInterval: 5000, revalidateOnFocus: true, dedupingInterval: 2000,
  });

  const {
    activeMsg,
    showMessagePanel, setShowMessagePanel,
    msgTab, setMsgTab,
    msgText, setMsgText,
    msgDuration, setMsgDuration,
    postMessage, clearMessage, addQueueMessage,
  } = useAnnouncements({ activeSession, mutateRequests: mutate });

  // ── Spotify plugin ────────────────────────────────────────────────────────────
  const spotify = useSpotifyPlugin({ isActive: isSpotify, rawRequests, mutate });

  const { data: stripeStatus } = useSWR('/api/dev/stripe-status', fetcher, {
    refreshInterval: 10000, shouldRetryOnError: false,
  });
  const stripeWarning = stripeStatus && !stripeStatus.active;

  async function closeSession() {
    await closeSessionBase(isSpotify ? () => spotify.onCloseSession() : undefined);
    mutate();
  }

  async function continueSession(id) {
    await continueSessionBase(id, async () => { mutate(); setShowSessions(false); });
  }

  const {
    pending, playing, queue, history,
    repeatClientIds, resolvedNames, lastPlayedAt, danceRequestCounts,
    playsPerClient, danceGroups, requesterGroups, nextQueuePos,
  } = useRequestGroups({ rawRequests, decayEnabled, halfLifeMinutes });

  const playingItem = playing[0] ?? null;
  useStandardAutoAdvance({ isSpotify, playingItem, mutate });

  const { sensors, handleDragEnd } = useQueueReorder({ queue, mutate });

  const { handleAction, clearHistory, saveGroupEdit } = useRequestActions({
    rawRequests, queue, nextQueuePos, history, isSpotify, spotify, mutate,
  });

  return (
    <>
    {showSessions && (
      <SessionsPanel
        sessions={sessions}
        activeSession={activeSession}
        onClose={() => setShowSessions(false)}
        onContinue={continueSession}
        onCloseSession={async (id) => { await closeSession(); setShowSessions(false); }}
      />
    )}
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
        </div>
      )}
      <TopBar
        activeSession={activeSession}
        closeSession={closeSession}
        isSpotify={isSpotify}
        spotifyConnected={spotify.connected}
        onShowSessions={() => setShowSessions(true)}
      />

      <ControlStrip
        activeSession={activeSession}
        partnerDancesEnabled={partnerDancesEnabled}
        togglePartnerDances={togglePartnerDances}
        tippingEnabled={tippingEnabled}
        toggleTipping={toggleTipping}
        decayEnabled={decayEnabled}
        cycleDecay={cycleDecay}
        currentDecayLabel={currentDecayLabel}
        activeMsg={activeMsg}
        clearMessage={clearMessage}
        showMessagePanel={showMessagePanel}
        msgTab={msgTab}
        setShowMessagePanel={setShowMessagePanel}
        setMsgTab={setMsgTab}
        setMsgText={setMsgText}
        setMsgDuration={setMsgDuration}
      />

      <MessagePanel
        activeSession={activeSession}
        showMessagePanel={showMessagePanel}
        msgTab={msgTab}
        msgText={msgText}
        setMsgText={setMsgText}
        msgDuration={msgDuration}
        setMsgDuration={setMsgDuration}
        activeMsg={activeMsg}
        clearMessage={clearMessage}
        postMessage={postMessage}
        addQueueMessage={addQueueMessage}
      />

      <div className={styles.layout}>
        {/* ── Queue column ── */}
        <section className={styles.column}>
          <div className={styles.colHead}>
            <span className={styles.colLabel}>Queue</span>
            <span className={styles.colCount}>{queue.length}</span>
          </div>

          <div className={styles.colBody}>
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
              <p className={styles.empty}>Queue is empty. Approve requests to add dances.</p>
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
                        requesterCount={danceRequestCounts[r.danceId || r.danceName] ?? 1}
                      />
                    )}
                  </SortableQueueItem>
                ))}
              </SortableContext>
            </DndContext>

            {isSpotify && <SpotifySearch onAdd={(track) => spotify.handleAdd(track, nextQueuePos)} />}

            {history.length > 0 && (
              <details className={styles.historyDetails}>
                <summary className={styles.historySummary}>
                  History ({history.length})
                  <button className={styles.clearHistBtn} onClick={e => { e.preventDefault(); clearHistory(); }}>
                    Clear
                  </button>
                </summary>
                {history.map(r => (
                  <div key={r._id} className={styles.histRow}>
                    <span className={r.status === 'played' ? styles.histDot : styles.histDotSkip} />
                    <span className={styles.histName}>{r.danceName}</span>
                    <span className={styles.histAge}>{timeAgo(r.updatedAt)} ago</span>
                  </div>
                ))}
              </details>
            )}
          </div>
        </section>

        {/* ── Pending column ── */}
        <section className={styles.column}>
          <div className={styles.colHead}>
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

          <div className={styles.colBody}>
            {/* By Dance */}
            {pendingTab === 'dances' && (
              danceGroups.length === 0
                ? <p className={styles.empty}>No pending requests yet.</p>
                : danceGroups.map(group => (
                    <PendingDanceGroup
                      key={group.danceId || group.danceName}
                      group={group}
                      playsPerClient={playsPerClient}
                      resolvedNames={resolvedNames}
                      onAction={handleAction}
                      onEdit={setEditingGroup}
                    />
                  ))
            )}

            {/* By Requester */}
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
        </section>
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
