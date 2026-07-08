import styles from '../../pages/dj-controller/dj-controller.module.css';
import { diffColor, formatTimestamp } from './utils';

export default function QueueCard({ request, onAction, resolvedName, dragHandleProps, requesterCount, estimatedPlayAt }) {
  const { _id, danceName, songName, artist, difficulty, stepsheet, clientId, notes, createdAt, tipCents, danceType, duration_ms } = request;
  const isMessage = danceType === 'message';
  const displayName = resolvedName || clientId || '';
  const hasCustomName = displayName && displayName !== clientId;

  return (
    <div className={`${styles.qCard} ${isMessage ? styles.qCardMessage : ''}`}>
      <div className={styles.qGrip} {...dragHandleProps} title="Drag to reorder">
        <span aria-hidden>⠿</span>
      </div>
      <div className={styles.qInfo}>
        <div className={styles.qName}>
          {isMessage
            ? <><span className={styles.qMsgIcon}>💬</span>{danceName}</>
            : stepsheet
              ? <a href={stepsheet} target="_blank" rel="noopener noreferrer" className={styles.qNameLink}>{danceName}</a>
              : danceName}
        </div>
        {!isMessage && songName && <div className={styles.qSong}>{songName}{artist ? ` — ${artist}` : ''}</div>}
        <div className={styles.qMeta}>
          {isMessage ? (
            <span className={styles.qMsgDuration}>
              {duration_ms ? `${Math.round(duration_ms / 60000)} min` : 'Until skipped'}
            </span>
          ) : (
            <>
              {difficulty && (
                <span className={styles.diffPip} style={{ background: diffColor(difficulty) }}>{difficulty}</span>
              )}
              {requesterCount > 1
                ? <span className={styles.queueCountBadge}>{requesterCount}</span>
                : displayName && (
                  <span className={styles.qWho}>
                    {hasCustomName ? displayName : clientId}
                    {hasCustomName && clientId && <span className={styles.qClientId}>{clientId}</span>}
                  </span>
                )
              }
              {(tipCents ?? 0) > 0 && (
                <span className={styles.qBeatChip}>♫ {Math.round(tipCents / 5)}</span>
              )}
            </>
          )}
          {estimatedPlayAt
            ? <span className={styles.qAge}>~{formatTimestamp(estimatedPlayAt)}</span>
            : null}
        </div>
        {!isMessage && notes && <div className={styles.qNote}>&ldquo;{notes}&rdquo;</div>}
      </div>
      <div className={styles.qActions}>
        <button className={styles.btnPlayed} onClick={() => onAction(_id, 'played')}>
          {isMessage ? '✓ Done' : '✓ Played'}
        </button>
        <div className={styles.qActionsRow}>
          <button className={styles.btnRemove} onClick={() => onAction(_id, 'remove')}>✕</button>
          {!isMessage && (
            <button className={styles.btnDequeue} onClick={() => onAction(_id, 'dequeue')} title="Move back to pending">→</button>
          )}
        </div>
      </div>
    </div>
  );
}
