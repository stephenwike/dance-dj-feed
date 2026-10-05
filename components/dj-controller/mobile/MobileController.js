import { useState, useEffect, useRef } from 'react';
import m from './mobile.module.css';
import PluginSlot, { SLOTS, hasSlot } from '../plugins/PluginSlot';
import PendingRequests from '../PendingRequests';
import TrackHistory from '../TrackHistory';
import RequestersPanel from '../RequestersPanel';
import MessagePanel from '../MessagePanel';
import NotificationsPanel from '../NotificationsPanel';
import SettingsPanel from '../SettingsPanel';
import FeedConfigPanel from '../FeedConfigPanel';
import WalletPanel from '../WalletPanel';
import SessionsPanel from '../SessionsPanel';
import DJAddPanel from '../DJAddPanel';
import { messagePanelProps, settingsPanelProps, feedConfigPanelProps } from '../DesktopController';
import LiveTab from './LiveTab';
import QueueTab from './QueueTab';
import MoreTab from './MoreTab';
import SessionSheet, { sessionStatusText } from './SessionSheet';

const TABS = [
  { id: 'live', icon: '🎛️', label: 'Live' },
  { id: 'queue', icon: '🎵', label: 'Queue' },
  { id: 'requests', icon: '📥', label: 'Requests' },
  { id: 'people', icon: '👥', label: 'People' },
  { id: 'more', icon: '☰', label: 'More' },
];

const PAGE_TITLES = {
  announce: 'Announcements',
  add: 'Add to queue',
  notifications: 'Tips & notifications',
  history: 'Played so far',
  settings: 'Session settings',
  feed: 'Feed display',
  sessions: 'Sessions',
  wallet: 'Wallet',
};

/**
 * The controller for a phone: the host can run the whole event from the
 * dance floor. All state comes from useController (`ctl`), shared with the
 * desktop layout; this decides only what's on screen.
 *
 *   header      — session (tap for the session sheet) and notifications
 *   tabs        — Live (home), Queue, Requests, People, More
 *   pages       — full-screen panels opened from More or quick actions
 *   sheets      — the session sheet; per-dance actions (QueueTab)
 *
 * The phone's Back button closes the open sheet or page, not the controller.
 */
export default function MobileController({ ctl, onUseDesktop }) {
  const [tab, setTab] = useState('live');
  const [page, setPage] = useState(null);
  const [sessionSheet, setSessionSheet] = useState(false);
  const { plugin, pluginRuntime, pluginController } = ctl;

  const pluginSlot = (name, extra = {}) => (hasSlot(plugin, name)
    ? <PluginSlot plugin={plugin} name={name} runtime={pluginRuntime} controller={pluginController} {...extra} />
    : null);

  // Phone Back button: while a page or sheet is open, one history entry
  // exists. Back closes whatever is open; closing by tap removes the entry.
  const anyOpen = !!page || sessionSheet;
  const pushedRef = useRef(false);
  useEffect(() => {
    if (anyOpen && !pushedRef.current) {
      window.history.pushState({ controllerLayer: true }, '');
      pushedRef.current = true;
    } else if (!anyOpen && pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    }
  }, [anyOpen]);
  useEffect(() => {
    const onPop = () => {
      if (!pushedRef.current) return; // our own history.back() after a tap-close
      pushedRef.current = false;
      setPage(null);
      setSessionSheet(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Leaving the notifications page marks them read (as on desktop).
  const prevPage = useRef(page);
  useEffect(() => {
    if (prevPage.current === 'notifications' && page !== 'notifications' && ctl.unreadCount > 0) ctl.markAllRead();
    prevPage.current = page;
  }, [page]);

  // A return from payout onboarding asks for the wallet.
  useEffect(() => {
    if (!ctl.focusPanel) return;
    setPage(ctl.focusPanel);
    ctl.clearFocusPanel();
  }, [ctl.focusPanel]);

  const s = ctl.workingSession;
  const statusClass = s?.status === 'active' ? m.statusLive : '';

  return (
    <div className={m.shell}>
      <header className={m.header}>
        <button className={m.sessionPill} onClick={() => setSessionSheet(true)} aria-label="Session menu">
          <span className={`${m.statusDot} ${statusClass}`} />
          <span className={m.sessionText}>
            <span className={m.sessionName}>{s?.name ?? 'No session'}</span>
            <span className={m.sessionMeta}>{sessionStatusText(ctl)}</span>
          </span>
          <span className={m.chevron}>▼</span>
        </button>
        <button className={m.iconBtn} onClick={() => setPage('notifications')} aria-label="Tips and notifications">
          🔔
          {ctl.unreadCount > 0 && <span className={m.badge}>{ctl.unreadCount}</span>}
        </button>
      </header>

      <Alerts ctl={ctl} />

      {(tab === 'requests' || tab === 'people') ? (
        <div className={m.panelHost}>
          {tab === 'requests' && <PendingRequests ctl={ctl} />}
          {tab === 'people' && <RequestersPanel workingSession={s} mutateSessions={ctl.mutateSessions} />}
        </div>
      ) : (
        <main className={m.content}>
          {tab === 'live' && (
            <LiveTab
              ctl={ctl}
              pluginControls={pluginSlot(SLOTS.REMOTE_CONTROLS)}
              onOpenPage={setPage}
              onShowQueue={() => setTab('queue')}
            />
          )}
          {tab === 'queue' && (
            <QueueTab
              ctl={ctl}
              itemPlugin={hasSlot(plugin, SLOTS.QUEUE_ITEM) ? request => pluginSlot(SLOTS.QUEUE_ITEM, { request }) : null}
              onOpenPage={setPage}
            />
          )}
          {tab === 'more' && <MoreTab ctl={ctl} onOpenPage={setPage} onUseDesktop={onUseDesktop} />}
        </main>
      )}

      <nav className={m.tabBar}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${m.tab} ${tab === t.id ? m.tabActive : ''}`}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            <span className={m.tabIcon}>{t.icon}</span>
            {t.label}
            {t.id === 'requests' && ctl.pendingCount > 0 && <span className={m.badge}>{ctl.pendingCount}</span>}
            {t.id === 'queue' && ctl.queue.length > 0 && <span className={m.badge} style={{ background: '#8a5cff' }}>{ctl.queue.length}</span>}
          </button>
        ))}
      </nav>

      {page && (
        <div className={m.page}>
          <div className={m.pageHeader}>
            <button className={m.backBtn} onClick={() => setPage(null)}>‹ Back</button>
            <span className={m.pageTitle}>{PAGE_TITLES[page]}</span>
          </div>
          {page === 'feed' && (
            <p className={m.pageNote}>The feed itself is designed on a computer (Feed Editor). Here you can switch its template and screen shape.</p>
          )}
          <div className={m.panelHost}>
            <Page page={page} ctl={ctl} onDone={() => setPage(null)} />
          </div>
        </div>
      )}

      {sessionSheet && (
        <SessionSheet ctl={ctl} onClose={() => setSessionSheet(false)} onOpenPage={setPage} />
      )}
    </div>
  );
}

/** The full-screen panels, reused from the desktop layout. */
function Page({ page, ctl, onDone }) {
  switch (page) {
    case 'announce':
      return <MessagePanel activeSession={ctl.liveSession} {...messagePanelProps(ctl.announcements)} />;
    case 'add':
      return <DJAddPanel activeSession={ctl.workingSession} nextQueuePos={ctl.nextQueuePos} mutate={ctl.mutate} />;
    case 'notifications':
      return <NotificationsPanel notifications={ctl.notifications} unreadCount={ctl.unreadCount} markRead={ctl.markRead} markAllRead={ctl.markAllRead} />;
    case 'history':
      return <TrackHistory history={ctl.history} onClear={ctl.clearHistory} />;
    case 'settings':
      return <SettingsPanel {...settingsPanelProps(ctl)} />;
    case 'feed':
      return <FeedConfigPanel {...feedConfigPanelProps(ctl)} />;
    case 'wallet':
      return <WalletPanel connectNotice={ctl.connectNotice} />;
    case 'sessions':
      return (
        <SessionsPanel
          sessions={ctl.sessions}
          onContinue={id => ctl.continueSession(id, onDone)}
          onCloseSession={async id => { await ctl.closeSession(id); onDone(); }}
        />
      );
    default:
      return null;
  }
}

/** Things that need the host's attention, under the header. */
function Alerts({ ctl }) {
  const { timeState, countdown } = ctl;
  return (
    <div className={m.alerts}>
      {(timeState === 'warning' || timeState === 'urgent') && (
        <div className={`${m.alert} ${timeState === 'urgent' ? m.alertDanger : ''}`}>
          ⏱️ Session ends in {countdown}
          <button onClick={() => ctl.setShowExtendModal(true)}>Extend</button>
        </div>
      )}
      {timeState === 'grace' && (
        <div className={`${m.alert} ${m.alertDanger}`}>
          ⛔ Time is up — closes in {countdown}
          <button onClick={() => ctl.setShowExtendModal(true)}>Extend</button>
        </div>
      )}
      {ctl.liveSession && !ctl.requestsEnabled && (
        <div className={m.alert}>
          ⛔ Requests are paused
          <button onClick={ctl.toggleRequestsEnabled}>Resume</button>
        </div>
      )}
      {ctl.stripeWarning && (
        <div className={`${m.alert} ${m.alertDanger}`}>
          ⚡ Stripe listener not running — payments won&apos;t confirm
          <button onClick={ctl.dismissStripeWarning}>Hide</button>
        </div>
      )}
    </div>
  );
}
