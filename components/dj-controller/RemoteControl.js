import styles from '../../pages/dj-controller/dj-controller.module.css';
import CountdownTimer from './CountdownTimer';

export default function RemoteControl({ playing, queue, onAction, activeSession }) {
  const track = playing[0] ?? null;
  const isPaused = !!(track?.pausedAt);

  if (!activeSession) return (
    <div className={styles.nowPlaying}>
      <p className={styles.nowPlayingEmpty}>Start a session to begin.</p>
    </div>
  );
  if (!track && queue.length === 0) return null;

  return (
    <div className={styles.nowPlaying}>
      {track ? (
        <>
          <div className={styles.nowPlayingStatus}>
            <span className={`${styles.nowPlayingDot} ${isPaused ? styles.nowPlayingDotPaused : styles.nowPlayingDotPlaying}`} />
            <span className={styles.nowPlayingStatusLabel}>{isPaused ? 'Paused' : 'Now Playing'}</span>
            {track.playStartedAt && !isPaused && (
              <CountdownTimer
                playStartedAt={track.playStartedAt}
                duration_ms={track.duration_ms}
                className={styles.nowPlayingCountdown}
              />
            )}
          </div>
          <div className={styles.nowPlayingTrack}>
            {track.danceType === 'partner'
              ? (track.songName
                  ? <>{track.songName}{track.artist ? <span className={styles.nowPlayingArtist}> — {track.artist}</span> : ''}</>
                  : (track.partnerStyle || 'Partner Dance'))
              : track.danceName}
          </div>
          {track.danceType === 'partner' && (
            <span className={styles.partnerBadge} style={{ alignSelf: 'flex-start' }}>Partner Dance</span>
          )}
          <div className={styles.nowPlayingButtons}>
            <button
              className={`${styles.nowPlayingBtn} ${isPaused ? styles.nowPlayingBtnResume : styles.nowPlayingBtnPause}`}
              onClick={() => onAction(track._id, isPaused ? 'resume' : 'pause')}
            >
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              className={`${styles.nowPlayingBtn} ${styles.nowPlayingBtnSkip}`}
              onClick={() => onAction(track._id, 'advance')}
            >
              ⏭ Skip
            </button>
            <button
              className={`${styles.nowPlayingBtn} ${styles.nowPlayingBtnStop}`}
              onClick={() => onAction(track._id, 'remove')}
            >
              ✕ Stop
            </button>
          </div>
        </>
      ) : (
        <button className={styles.nowPlayingStart} onClick={() => onAction(queue[0]._id, 'startQueue')}>
          ▶ Start Queue
        </button>
      )}
    </div>
  );
}
