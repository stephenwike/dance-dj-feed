import { signOut } from 'next-auth/react';
import styles from '../../pages/dj-controller/dj-controller.module.css';

export default function Sidebar({
  activeSession,
  activePanel, onSetPanel,
  activeMsg,
  pendingCount,
  unreadNotifCount,
  pluginStatus,
  mobileView, onShowQueue, onOpenRemote,
}) {
  const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';

  function btn(id, icon, label, extra = '') {
    return (
      <button
        className={`${styles.sidebarBtn} ${activePanel === id ? styles.sidebarBtnActive : ''} ${extra}`}
        onClick={() => onSetPanel(id)}
        title={label}
      >
        <span className={styles.sidebarIcon}>{icon}</span>
        <span className={styles.sidebarLabel}>{label}</span>
      </button>
    );
  }

  return (
    <aside className={styles.sidebar}>
      {/* Session status dot */}
      <div
        className={`${styles.sidebarDot} ${activeSession ? styles.sidebarDotActive : ''}`}
        title={activeSession ? `Active: ${activeSession.name}` : 'No active session'}
      />

      {/* Phones only: the floor remote, and the queue (which has its own column on wider screens) */}
      <button className={`${styles.sidebarBtn} ${styles.sidebarMobileOnly}`} onClick={onOpenRemote} title="Floor remote">
        <span className={styles.sidebarIcon}>🎛️</span>
        <span className={styles.sidebarLabel}>Remote</span>
      </button>
      <button
        className={`${styles.sidebarBtn} ${styles.sidebarMobileOnly} ${mobileView === 'queue' ? styles.sidebarBtnActive : ''}`}
        onClick={onShowQueue}
        title="Queue"
      >
        <span className={styles.sidebarIcon}>🎵</span>
        <span className={styles.sidebarLabel}>Queue</span>
      </button>

      <div className={styles.sidebarDivider} />

      {/* Requests — shows pending count badge */}
      <button
        className={`${styles.sidebarBtn} ${activePanel === 'requests' ? styles.sidebarBtnActive : ''}`}
        onClick={() => onSetPanel('requests')}
        title="Incoming Requests"
      >
        <span className={styles.sidebarIcon}>
          📥
          {pendingCount > 0 && (
            <span className={styles.sidebarBadge}>{pendingCount}</span>
          )}
        </span>
        <span className={styles.sidebarLabel}>Requests</span>
      </button>

      {btn('requesters', '👥', 'Requesters')}
      {btn('dj-add', '➕', 'Add to Queue')}
      {btn('messages', '💬', 'Messages', activeMsg && activePanel !== 'messages' ? styles.sidebarBtnAlert : '')}

      {/* Notifications bell with unread badge */}
      <button
        className={`${styles.sidebarBtn} ${activePanel === 'notifications' ? styles.sidebarBtnActive : ''}`}
        onClick={() => onSetPanel('notifications')}
        title="Notifications"
      >
        <span className={styles.sidebarIcon}>
          🔔
          {unreadNotifCount > 0 && (
            <span className={styles.sidebarBadge}>{unreadNotifCount}</span>
          )}
        </span>
        <span className={styles.sidebarLabel}>Notifs</span>
      </button>

      {btn('feed-config', '📺', 'Feed')}
      {btn('settings', '⚙️', 'Settings')}
      {btn('history', '📋', 'History')}
      {btn('sessions', '🗂️', 'Sessions')}

      {/* Playback plugin status (see components/dj-controller/plugins) */}
      {pluginStatus && (
        <>
          <div className={styles.sidebarDivider} />
          {pluginStatus}
        </>
      )}

      {/* Spacer pushes account items to bottom */}
      <div className={styles.sidebarSpacer} />
      <div className={styles.sidebarDivider} />

      {paymentsEnabled && btn('wallet', '💳', 'Wallet')}

      <button
        className={styles.sidebarBtn}
        onClick={() => signOut({ callbackUrl: '/' })}
        title="Sign out"
      >
        <span className={styles.sidebarIcon}>↩</span>
        <span className={styles.sidebarLabel}>Sign out</span>
      </button>
    </aside>
  );
}
