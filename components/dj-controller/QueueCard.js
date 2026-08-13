import styles from '../../pages/dj-controller/dj-controller.module.css';
import { diffColor, formatTimestamp } from './utils';

export default function QueueCard({ request, onAction, onEdit, resolvedName, dragHandleProps, requesterCount, totalBeats = 0, estimatedPlayAt, score }) {
  const { _id, danceName, songName, artist, difficulty, stepsheet, clientId, notes, createdAt, tipCents, danceType, partnerStyle, duration_ms } = request;
  const isMessage = danceType === 'message';
  const isPartner = danceType === 'partner';
  const displayName = resolvedName || clientId || '';
  const hasCustomName = displayName && displayName !== clientId;

  const partnerPrimary = songName
    ? <>{songName}{artist ? <span className={styles.danceGroupNameArtist}> — {artist}</span> : ''}</>
    : (partnerStyle || 'Partner Dance');

  return (
    <div className={`${styles.qCard} ${isMessage ? styles.qCardMessage : ''}`}>
      <div className={styles.qGrip} {...dragHandleProps} title="Drag to reorder">
        <span aria-hidden>⠿</span>
      </div>
      <div className={styles.qInfo}>
        <div className={styles.qName}>
          {isMessage
            ? <><span className={styles.qMsgIcon}>💬</span>{danceName}</>
            : isPartner
              ? partnerPrimary
              : stepsheet
                ? <a href={stepsheet} target="_blank" rel="noopener noreferrer" className={styles.qNameLink}>{danceName}</a>
                : danceName}
        </div>
        <div className={styles.qMeta}>
          {isMessage ? (
            <span className={styles.qMsgDuration}>
              {duration_ms ? `${Math.round(duration_ms / 60000)} min` : 'Until skipped'}
            </span>
          ) : isPartner ? (
            <span className={styles.partnerBadge}>Partner Dance</span>
          ) : (
            <>
              {difficulty && <span className={styles.diffPip} style={{ background: diffColor(difficulty) }}>{difficulty}</span>}
              {songName && <span className={styles.qSong}>{songName}{artist ? ` — ${artist}` : ''}</span>}
            </>
          )}
        </div>
        {!isMessage && notes && <div className={styles.qNote}>&ldquo;{notes}&rdquo;</div>}
      </div>
      <div className={styles.qCardPanel}>
        <div className={styles.qCardStatsRow}>
          <span className={styles.qCardStatCell}>
            <span aria-hidden="true">★</span>
            {score != null ? score.toFixed(1) : '—'}
          </span>
          <span className={styles.qCardStatCell}>
            <svg width="12" height="10" viewBox="0 0 24 22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 11c1.66 0 3-1.34 3-3s-1.34-3-3-3"/>
              <path d="M21 21c0-2.76-2.24-5-5-5h-.5"/>
              <circle cx="9" cy="8" r="3"/>
              <path d="M3 21c0-2.76 2.24-5 5-5h2c2.76 0 5 2.24 5 5"/>
            </svg>
            {requesterCount}
          </span>
          <span className={styles.qCardStatCell}>
            <img src="/beats/coin_front.png" style={{width:'1em',height:'1em',objectFit:'contain'}} alt="" aria-hidden="true" />
            {totalBeats || '—'}
          </span>
          <span className={styles.qCardStatCell}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            {estimatedPlayAt ? formatTimestamp(estimatedPlayAt) : '—'}
          </span>
        </div>
        <div className={styles.qCardActionsRow}>
          <button
            className={`${styles.qCardActionBtn} ${styles.actionCellDequeue}`}
            onClick={!isMessage ? () => onAction(_id, 'dequeue') : undefined}
            title="Move back to pending"
            style={isMessage ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
          >
            <svg width="11" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 3 12 9 6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
            </svg>
            Dequeue
          </button>
          <button className={`${styles.qCardActionBtn} ${styles.actionCellEdit}`} onClick={() => onEdit?.(request)} title="Edit">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
          <button className={`${styles.qCardActionBtn} ${styles.actionCellDeny}`} onClick={() => onAction(_id, 'remove')} title="Remove from queue">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" aria-hidden="true">
              <line x1="4" y1="4" x2="20" y2="20"/>
              <line x1="20" y1="4" x2="4" y2="20"/>
            </svg>
            Deny
          </button>
          <button className={`${styles.qCardActionBtn} ${styles.actionCellPlayed}`} onClick={() => onAction(_id, 'played')} title="Mark as played">
            <svg width="11" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {isMessage ? 'Done' : 'Played'}
          </button>
        </div>
      </div>
    </div>
  );
}
