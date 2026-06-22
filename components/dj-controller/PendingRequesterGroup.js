import { useState } from 'react';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { timeAgo } from './utils';

export default function PendingRequesterGroup({ group, playsPerClient }) {
  const [expanded, setExpanded] = useState(false);
  const effectivePlays = playsPerClient[group.clientId] ?? 0;
  const currentWeight = 1 / (1 + effectivePlays);

  return (
    <div className={styles.requesterGroup}>
      <button className={styles.requesterRow} onClick={() => setExpanded(e => !e)}>
        <div className={styles.requesterLeft}>
          <span className={styles.requesterName}>{group.displayName}</span>
          {group.clientId && group.displayName !== group.clientId && (
            <span className={styles.qClientId}>{group.clientId}</span>
          )}
        </div>
        <div className={styles.requesterRight}>
          <span className={styles.weightChip} title="Current vote weight">×{currentWeight.toFixed(2)}</span>
          <span className={styles.reqPill}>{group.submitted} sent</span>
          {group.fulfilled > 0 && <span className={styles.reqPillGreen}>{group.fulfilled} played</span>}
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
