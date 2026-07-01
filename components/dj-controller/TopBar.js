import Link from 'next/link';
import styles from '../../pages/dj-controller/dj-controller.module.css';

export default function TopBar({ activeSession, closeSession, timeState, countdown }) {
  return (
    <header className={styles.topBar}>
      <span className={styles.appName}>
        <span className={styles.appNameFull}>🎛️ DanceCard</span>
        <span className={styles.appNameShort}>🎛️</span>
      </span>

      <div className={styles.topBarSession}>
        {activeSession ? (
          <>
            <span className={styles.sessionBarDot} />
            <span className={styles.topBarSessionName}>{activeSession.name}</span>
            {activeSession.endsAt && (
              <span className={styles.topBarEndsAt}>
                {timeState && timeState !== 'active'
                  ? countdown
                  : `ends ${new Date(activeSession.endsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
              </span>
            )}
            <button className={styles.topBarEndBtn} onClick={closeSession}>End</button>
          </>
        ) : (
          <>
            <span className={styles.topBarNoSession}>No active session</span>
            <Link href="/start" className={styles.topBarNewBtn}>+ New Session</Link>
          </>
        )}
      </div>

      {activeSession && (
        <div className={styles.topBarQuickLinks}>
          <button
            className={styles.topBarQuickBtn}
            onClick={() => window.open(`/feed/${activeSession.slug}`, '_blank')}
          >
            🖥️ Feed ↗
          </button>
          <button
            className={styles.topBarQuickBtn}
            onClick={() => window.open(`/request/${activeSession.slug}`, '_blank')}
          >
            📱 Requests ↗
          </button>
        </div>
      )}
    </header>
  );
}
