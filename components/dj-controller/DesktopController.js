import { useState, useEffect, useRef } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import PluginSlot, { SLOTS, hasSlot } from './plugins/PluginSlot';
import SortableQueueItem from './SortableQueueItem';
import RemoteControl from './RemoteControl';
import QueueCard from './QueueCard';
import SessionsPanel from './SessionsPanel';
import DJAddPanel from './DJAddPanel';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import SettingsPanel from './SettingsPanel';
import MessagePanel from './MessagePanel';
import FeedConfigPanel from './FeedConfigPanel';
import WalletPanel from './WalletPanel';
import NotificationsPanel from './NotificationsPanel';
import RequestersPanel from './RequestersPanel';
import SessionWarningBanner from './SessionWarningBanner';
import PendingRequests from './PendingRequests';
import TrackHistory from './TrackHistory';

/**
 * The controller for a computer screen: sidebar, a swappable left panel, and
 * the queue on the right. All state comes from useController (`ctl`); only
 * which panel is open lives here.
 */
export default function DesktopController({ ctl }) {
  const [activePanel, setActivePanel] = useState('requests');
  const {
    plugin, pluginRuntime, pluginController, itemTone,
    liveSession, workingSession, isGrace, playing, queue,
  } = ctl;

  const pluginSlot = (name, fallback = null, extra = {}) => hasSlot(plugin, name)
    ? <PluginSlot plugin={plugin} name={name} runtime={pluginRuntime} controller={pluginController} {...extra} />
    : fallback;
  const itemSlot = request => pluginSlot(SLOTS.QUEUE_ITEM, null, { request });

  // A return from payout onboarding asks for the wallet.
  useEffect(() => {
    if (!ctl.focusPanel) return;
    setActivePanel(ctl.focusPanel);
    ctl.clearFocusPanel();
  }, [ctl.focusPanel]);

  // Mark all notifications read when navigating away from the notifications panel
  const prevPanel = useRef(activePanel);
  useEffect(() => {
    if (prevPanel.current === 'notifications' && activePanel !== 'notifications' && ctl.unreadCount > 0) {
      ctl.markAllRead();
    }
    prevPanel.current = activePanel;
  }, [activePanel]);

  return (
    <div className={styles.page}>
      {ctl.stripeWarning && (
        <div className={styles.stripeBanner}>
          ⚡ Stripe listener not running — payments won&apos;t confirm. Run <code>npm run stripe</code> in a separate terminal.
          <button className={styles.stripeBannerDismiss} onClick={ctl.dismissStripeWarning}>✕</button>
        </div>
      )}
      <TopBar
        workingSession={workingSession}
        liveSessions={ctl.liveSessions}
        selectSession={ctl.selectSession}
        closeSession={() => ctl.closeSession()}
        discardDraft={ctl.discardDraft}
        timeState={ctl.timeState}
        countdown={ctl.countdown}
      />
      <SessionWarningBanner
        timeState={ctl.timeState}
        countdown={ctl.countdown}
        onExtend={() => ctl.setShowExtendModal(true)}
      />

      <div className={styles.body}>
        {pluginSlot(SLOTS.OVERLAY)}
        <Sidebar
          activeSession={liveSession}
          activePanel={activePanel}
          onSetPanel={setActivePanel}
          activeMsg={ctl.announcements.activeMsg}
          pendingCount={ctl.pendingCount}
          unreadNotifCount={ctl.unreadCount}
          pluginStatus={pluginSlot(SLOTS.SIDEBAR_STATUS)}
        />

        {/* ── Left panel (swappable) ── */}
        <div className={`${styles.leftPanel} ${isGrace ? styles.frozen : ''}`}>
          {activePanel === 'requests' && <PendingRequests ctl={ctl} />}

          {activePanel === 'requesters' && (
            <RequestersPanel workingSession={workingSession} mutateSessions={ctl.mutateSessions} />
          )}

          {activePanel === 'messages' && (
            <MessagePanel activeSession={liveSession} {...messagePanelProps(ctl.announcements)} />
          )}

          {activePanel === 'notifications' && (
            <NotificationsPanel
              notifications={ctl.notifications}
              unreadCount={ctl.unreadCount}
              markRead={ctl.markRead}
              markAllRead={ctl.markAllRead}
            />
          )}

          {activePanel === 'settings' && <SettingsPanel {...settingsPanelProps(ctl)} />}

          {activePanel === 'feed-config' && <FeedConfigPanel {...feedConfigPanelProps(ctl)} />}

          {activePanel === 'wallet' && <WalletPanel connectNotice={ctl.connectNotice} />}

          {activePanel === 'dj-add' && (
            <DJAddPanel activeSession={workingSession} nextQueuePos={ctl.nextQueuePos} mutate={ctl.mutate} />
          )}

          {activePanel === 'sessions' && (
            <SessionsPanel
              sessions={ctl.sessions}
              onContinue={id => ctl.continueSession(id, () => setActivePanel('requests'))}
              onCloseSession={async id => { await ctl.closeSession(id); setActivePanel('requests'); }}
            />
          )}

          {activePanel === 'history' && <TrackHistory history={ctl.history} onClear={ctl.clearHistory} />}
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
                    playing={playing} queue={queue} onAction={ctl.handleAction} activeSession={liveSession}
                    stats={ctl.statsFor(playing[0])}
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

              <DndContext sensors={ctl.reorder.sensors} collisionDetection={closestCenter} onDragEnd={ctl.reorder.handleDragEnd}>
                <SortableContext items={queue.map(r => r._id)} strategy={verticalListSortingStrategy}>
                  {queue.map(r => {
                    const stats = ctl.statsFor(r);
                    return (
                      <SortableQueueItem key={r._id} id={r._id}>
                        {(dragHandleProps) => (
                          <QueueCard
                            request={r}
                            onAction={ctl.handleAction}
                            onEdit={(req) => ctl.setEditingGroup({ requests: [req], danceName: req.danceName, difficulty: req.difficulty || '' })}
                            resolvedName={ctl.resolvedNames[r.clientId]}
                            dragHandleProps={dragHandleProps}
                            requesterCount={stats.count || 1}
                            totalBeats={stats.beats}
                            estimatedPlayAt={ctl.queueTimes[r._id]}
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
  );
}

// Props for the panels shared by both layouts, built from useController.

export function messagePanelProps(a) {
  return {
    msgTab: a.msgTab, setMsgTab: a.setMsgTab,
    msgText: a.msgText, setMsgText: a.setMsgText,
    msgDuration: a.msgDuration, setMsgDuration: a.setMsgDuration,
    sendToAll: a.sendToAll, setSendToAll: a.setSendToAll,
    activeMsg: a.activeMsg, clearMessage: a.clearMessage,
    postMessage: a.postMessage, addQueueMessage: a.addQueueMessage,
  };
}

export function settingsPanelProps(ctl) {
  return {
    activeSession: ctl.workingSession,
    requestsEnabled: ctl.requestsEnabled, toggleRequestsEnabled: ctl.toggleRequestsEnabled,
    partnerDancesEnabled: ctl.partnerDancesEnabled, togglePartnerDances: ctl.togglePartnerDances,
    tippingEnabled: ctl.tippingEnabled, toggleTipping: ctl.toggleTipping,
    fairnessScoringEnabled: ctl.fairnessScoringEnabled, toggleWeighting: ctl.toggleWeighting,
    cycleDecay: ctl.cycleDecay, decayLabel: ctl.decayLabel,
    queueVisibleToRequesters: ctl.queueVisibleToRequesters, toggleQueueVisibility: ctl.toggleQueueVisibility,
    queueVisibleCount: ctl.queueVisibleCount, setQueueVisibleCount: ctl.setQueueVisibleCount,
    pluginId: ctl.plugin.id, setPlugin: ctl.setPlugin, pluginLocked: ctl.playing.length > 0,
  };
}

export function feedConfigPanelProps(ctl) {
  return {
    activeSession: ctl.workingSession,
    feedAspectRatio: ctl.feedAspectRatio, feedTemplateId: ctl.feedTemplateId,
    setFeedAspectRatio: ctl.setFeedAspectRatio, setFeedTemplateId: ctl.setFeedTemplateId,
    applyFeedTemplate: ctl.applyFeedTemplate,
  };
}
