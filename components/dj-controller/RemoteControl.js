import { useState, useEffect } from 'react';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { diffColor } from './utils';

/* ── SVG icons ── */
function IconRestart() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="3" height="18" rx="1"/>
      <path d="M21 4L9 12l12 8V4z"/>
    </svg>
  );
}
function IconSkip() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 4l12 8-12 8V4z"/>
      <rect x="18" y="3" width="3" height="18" rx="1"/>
    </svg>
  );
}
function IconPause() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="3" width="4" height="18" rx="1.5"/>
      <rect x="15" y="3" width="4" height="18" rx="1.5"/>
    </svg>
  );
}
function IconPlay() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 3l14 9-14 9V3z"/>
    </svg>
  );
}
function IconSquare() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3"/>
    </svg>
  );
}
function IconRewind() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
    </svg>
  );
}
function IconFastFwd() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
    </svg>
  );
}
function IconRequeue() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
    </svg>
  );
}

/* Countdown that works from playStartedAt + duration_ms */
function Countdown({ playStartedAt, duration_ms, paused, pausedAt }) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    function calc() {
      const total = duration_ms ?? 180_000;
      if (paused && pausedAt) {
        return Math.max(0, total - (new Date(pausedAt) - new Date(playStartedAt)));
      }
      return Math.max(0, total - (Date.now() - new Date(playStartedAt).getTime()));
    }
    setRemaining(calc());
    if (paused) return;
    const iv = setInterval(() => setRemaining(calc()), 1000);
    return () => clearInterval(iv);
  }, [playStartedAt, duration_ms, paused, pausedAt]);

  if (remaining === null) return null;
  const s = Math.floor(remaining / 1000);
  return (
    <span className={`${styles.npCountdown} ${paused ? styles.npCountdownPaused : ''}`}>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

export default function RemoteControl({
  playing, queue, onAction, activeSession,
  danceRequestCounts = {}, danceBeats = {}, danceScores = {}, partnerUpvoteCounts = {},
}) {
  const track = playing[0] ?? null;
  const isPaused = !!(track?.pausedAt);
  const isPartner = track?.danceType === 'partner';
  const isMessage = track?.danceType === 'message';

  // Derived stats for the playing track
  const danceKey = (track?.danceName || '').toLowerCase().trim();
  const scoreKey  = isPartner ? (track?.partnerGroupId || track?._id) : danceKey;
  const requesterCount = track
    ? (isPartner ? 1 + (partnerUpvoteCounts[track._id] ?? 0) : (danceRequestCounts[danceKey] ?? 1))
    : 0;
  const totalBeats = track
    ? (isPartner ? (danceBeats[track._id] ?? 0) : (danceBeats[danceKey] ?? 0))
    : 0;
  const score = track ? (danceScores[scoreKey] ?? 0) : 0;

  if (!activeSession) return (
    <div className={styles.nowPlaying}>
      <p className={styles.nowPlayingEmpty}>Start a session to begin.</p>
    </div>
  );
  if (!track && queue.length === 0) return null;

  if (!track) {
    return (
      <div className={styles.nowPlaying}>
        <button className={styles.nowPlayingStart} onClick={() => onAction(queue[0]._id, 'startQueue')}>
          ▶ Start Queue
        </button>
      </div>
    );
  }

  return (
    <div className={styles.nowPlaying}>

      {/* ══ Left: track details ══ */}
      <div className={styles.npDetails}>

        {/* Status */}
        <div className={styles.nowPlayingStatus}>
          <span className={`${styles.nowPlayingDot} ${isPaused ? styles.nowPlayingDotPaused : styles.nowPlayingDotPlaying}`} />
          <span className={styles.nowPlayingStatusLabel}>{isPaused ? 'Paused' : 'Now Playing'}</span>
        </div>

        {/* Track name */}
        <div className={styles.npTrackName}>
          {isMessage && <span style={{ marginRight: 4 }}>💬</span>}
          {isPartner
            ? (track.songName
                ? <>{track.songName}{track.artist ? <span className={styles.nowPlayingArtist}> — {track.artist}</span> : ''}</>
                : (track.partnerStyle || 'Partner Dance'))
            : (track.stepsheet
                ? <a href={track.stepsheet} target="_blank" rel="noopener noreferrer" className={styles.npTrackLink}>{track.danceName}</a>
                : track.danceName)
          }
        </div>

        {/* Badges + stats combined row */}
        <div className={styles.npBadgeRow}>
          {isPartner && <span className={styles.partnerBadge}>Partner Dance</span>}
          {!isPartner && !isMessage && track.difficulty && (
            <span className={styles.diffPip} style={{ background: diffColor(track.difficulty), fontSize: '0.6rem' }}>
              {track.difficulty}
            </span>
          )}
          {track.isSongSwap && <span className={styles.swapBadgePending}>↻ Swap</span>}
          {!isMessage && <>
            <span className={styles.npStat}>
              <svg width="11" height="11" viewBox="0 0 24 22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 11c1.66 0 3-1.34 3-3s-1.34-3-3-3"/>
                <path d="M21 21c0-2.76-2.24-5-5-5h-.5"/>
                <circle cx="9" cy="8" r="3"/>
                <path d="M3 21c0-2.76 2.24-5 5-5h2c2.76 0 5 2.24 5 5"/>
              </svg>
              {requesterCount}
            </span>
            <span className={styles.npStat}>
              <img src="/beats/coin_front.png" style={{ width: '0.9em', height: '0.9em', objectFit: 'contain' }} alt="" aria-hidden="true" />
              {totalBeats || '—'}
            </span>
            <span className={styles.npStat}>
              <span aria-hidden="true">★</span>
              {score > 0 ? score.toFixed(1) : '—'}
            </span>
          </>}
        </div>

        {/* Sub-line: original song, swap song, or partner style */}
        {!isPartner && !isMessage && !track.isSongSwap && track.songName && (
          <div className={styles.npSub}>{track.songName}{track.artist ? ` — ${track.artist}` : ''}</div>
        )}
        {track.isSongSwap && track.swapSongName && (
          <div className={styles.npSwap}>{track.swapSongName}{track.swapArtist ? ` — ${track.swapArtist}` : ''}</div>
        )}
        {isPartner && track.songName && track.partnerStyle && (
          <div className={styles.npSub}>{track.partnerStyle}</div>
        )}

      </div>

      {/* ══ Right: remote controls ══ */}
      <div className={styles.npControls}>

        {/* Row 1: countdown + restart + skip + requeue */}
        <div className={styles.npControlsTop}>
          <div style={{ flex: 1 }}>
            <Countdown
              playStartedAt={track.playStartedAt}
              duration_ms={track.duration_ms}
              paused={isPaused}
              pausedAt={track.pausedAt}
            />
          </div>
          <button className={`${styles.tBtn} ${styles.tBtnNavSm}`}
            onClick={() => onAction(track._id, 'restart')} title="Restart">
            <IconRestart />
          </button>
          <button className={`${styles.tBtn} ${styles.tBtnNavSm} ${styles.tBtnNavSkipSm}`}
            onClick={() => onAction(track._id, 'advance')} title="Skip to end">
            <IconSkip />
          </button>
          <button className={styles.tBtnRequeue}
            onClick={() => onAction(track._id, 'requeue')} title="Return to front of queue">
            <IconSquare />
          </button>
        </div>

        {/* Row 2: rewind / play/pause / fast-forward */}
        <div className={styles.transportFull}>
          <button className={`${styles.tBtn} ${styles.tBtnShiftSm} ${styles.tBtnRewind}`}
            onClick={() => onAction(track._id, 'shiftTime', 10_000)} title="Rewind 10s">
            <IconRewind /><span>10s</span>
          </button>
          <button
            className={`${styles.tBtn} ${styles.tBtnCenterSm} ${isPaused ? styles.tBtnPlaying : styles.tBtnPaused}`}
            onClick={() => onAction(track._id, isPaused ? 'resume' : 'pause')}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <IconPlay /> : <IconPause />}
          </button>
          <button className={`${styles.tBtn} ${styles.tBtnShiftSm} ${styles.tBtnFastFwd}`}
            onClick={() => onAction(track._id, 'shiftTime', -10_000)} title="Skip forward 10s">
            <span>10s</span><IconFastFwd />
          </button>
        </div>

      </div>

    </div>
  );
}
