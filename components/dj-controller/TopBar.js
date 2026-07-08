import Link from 'next/link';
import styles from '../../pages/dj-controller/dj-controller.module.css';

export default function TopBar({ activeSession, draftSession, closeSession, discardDraft, timeState, countdown }) {
  const isDraft = !activeSession && !!draftSession;

  return (
    <header className={styles.topBar}>
      <span className={styles.appName}>
        <span className={styles.appNameFull}>🎛️ DanceFeed</span>
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
        ) : isDraft ? (
          <>
            <span className={styles.topBarDraftDot} />
            <span className={styles.topBarSessionName}>{draftSession.name}</span>
            <span className={styles.topBarDraftBadge}>setup</span>
            <Link href="/start" className={styles.topBarStartBtn}>▶ Start Event</Link>
            <button className={styles.topBarEndBtn} onClick={discardDraft}>Discard</button>
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
