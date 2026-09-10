import { useState } from 'react';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { timeAgo } from './utils';

export default function PendingRequesterGroup({ group, playsPerClient, suppressedSet, onToggleSuppress }) {
  const [expanded, setExpanded] = useState(false);
  const isSuppressed = suppressedSet?.has(group.clientId) ?? false;
  const effectivePlays = playsPerClient[group.clientId] ?? 0;
  const currentWeight = 1 / (1 + effectivePlays);

  return (
    <div className={`${styles.requesterGroup} ${isSuppressed ? styles.requesterGroupSuppressed : ''}`}>
      <button className={styles.requesterRow} onClick={() => setExpanded(e => !e)}>
        <div className={styles.requesterLeft}>
          <span className={styles.requesterName}>
            {group.nickname || group.displayName}
          </span>
          {group.nickname && (
            <span className={styles.qClientId}>{group.displayName}</span>
          )}
        </div>
        <div className={styles.requesterRight}>
          {!isSuppressed && (
            <>
              <span className={styles.weightChip} title="Current vote weight">×{currentWeight.toFixed(2)}</span>
              <span className={styles.reqPill}>{group.submitted} sent</span>
              {group.fulfilled > 0 && <span className={styles.reqPillGreen}>{group.fulfilled} played</span>}
            </>
          )}
          <button
            className={isSuppressed ? styles.reqPillGreen : styles.reqPillRed}
            onClick={e => { e.stopPropagation(); onToggleSuppress?.(group.clientId, !isSuppressed); }}
          >
            {isSuppressed ? '✓ Re-enable' : '🚫 Disable'}
          </button>
          <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {expanded && (
        <ul className={styles.requesterExpanded}>
          {group.requests.map(r => (
            <li key={r._id} className={styles.requesterExpandedRow}>
              <span className={`${styles.statusDot} ${styles['s_' + r.status]}`} />
              <span className={styles.expandedWho}>{r.danceName}</span>
              <span className={styles.qAge}>{timeAgo(r.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
