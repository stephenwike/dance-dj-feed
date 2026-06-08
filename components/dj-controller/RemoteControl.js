import styles from '../../pages/dj-controller/dj-controller.module.css';
import CountdownTimer from './CountdownTimer';

export default function RemoteControl({ playing, queue, onAction, activeSession }) {
  const track = playing[0] ?? null;
  const isPaused = !!(track?.pausedAt);

  if (!activeSession) return (
    <div className={styles.remote}>
      <p className={styles.remoteNoSession}>Open a session to start the queue.</p>
    </div>
  );
  if (!track && queue.length === 0) return null;

  return (
    <div className={styles.remote}>
      {track ? (
        <>
          <div className={styles.remoteTrackRow}>
            <div className={styles.remoteTrackInfo}>
              <span className={styles.remoteStatus}>{isPaused ? '⏸ Paused' : '▶ Now Playing'}</span>
              <span className={styles.remoteTrackName}>{track.danceName}</span>
            </div>
            {track.playStartedAt && !isPaused && (
              <CountdownTimer playStartedAt={track.playStartedAt} duration_ms={track.duration_ms} className={styles.remoteCountdown} />
            )}
          </div>
          <div className={styles.remoteButtons}>
            <button
              className={`${styles.remoteBtn} ${isPaused ? styles.remoteBtnResume : styles.remoteBtnPause}`}
              onClick={() => onAction(track._id, isPaused ? 'resume' : 'pause')}
            >
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button className={`${styles.remoteBtn} ${styles.remoteBtnSkip}`} onClick={() => onAction(track._id, 'advance')}>
              ⏭ Skip
            </button>
            <button className={`${styles.remoteBtn} ${styles.remoteBtnStop}`} onClick={() => onAction(track._id, 'remove')}>
              ✕ Stop
            </button>
          </div>
        </>
      ) : (
        <button className={styles.remoteBtnStart} onClick={() => onAction(queue[0]._id, 'startQueue')}>
          ▶ Start Queue
        </button>
      )}
    </div>
  );
}
