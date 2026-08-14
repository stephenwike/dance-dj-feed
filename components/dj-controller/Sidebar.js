import { signOut } from 'next-auth/react';
import styles from '../../pages/dj-controller/dj-controller.module.css';

export default function Sidebar({
  activeSession,
  activePanel, onSetPanel,
  activeMsg,
  pendingCount,
  isSpotify, spotifyConnected,
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

      {btn('dj-add', '➕', 'Add to Queue')}
      {btn('messages', '💬', 'Messages', activeMsg && activePanel !== 'messages' ? styles.sidebarBtnAlert : '')}
      {btn('feed-config', '📺', 'Feed')}
      {btn('settings', '⚙️', 'Settings')}
      {btn('history', '📋', 'History')}
      {btn('sessions', '🗂️', 'Sessions')}

      {isSpotify && (
        <>
          <div className={styles.sidebarDivider} />
          {spotifyConnected
            ? <div className={`${styles.sidebarBtn} ${styles.sidebarBtnSpotify}`} title="Spotify connected">
                <span className={styles.sidebarIcon}>●</span>
                <span className={styles.sidebarLabel}>Spotify</span>
              </div>
            : <a href="/api/spotify/auth" className={`${styles.sidebarBtn} ${styles.sidebarBtnSpotifyOff}`} title="Connect Spotify">
                <span className={styles.sidebarIcon}>○</span>
                <span className={styles.sidebarLabel}>Spotify</span>
              </a>
          }
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
