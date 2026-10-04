import styles from '../../pages/dj-controller/dj-controller.module.css';
import { timeAgo } from './utils';

export const historyName = r => (r.danceType === 'partner'
  ? (r.songName || r.partnerStyle || r.danceName || 'Partner Dance')
  : (r.danceName || ''));

// Collapse repeat entries of the same dance played within 5 minutes of each
// other (e.g. several requests for one play that were marked individually).
export function dedupeHistory(history) {
  const lastSeen = {};
  return history.filter(r => {
    const key = historyName(r).toLowerCase().trim();
    const t = new Date(r.updatedAt).getTime();
    if (lastSeen[key] !== undefined && Math.abs(t - lastSeen[key]) < 5 * 60 * 1000) return false;
    lastSeen[key] = t;
    return true;
  });
}

/**
 * What has played this session. Used by both layouts.
 * `bare` — leave out the panel frame (the phone layout supplies its own).
 */
export default function TrackHistory({ history, onClear, bare = false }) {
  const rows = history.length === 0 ? (
    <p className={styles.empty} style={{ padding: '12px 14px' }}>No tracks played yet this session.</p>
  ) : (
    dedupeHistory(history).map(r => (
      <div key={r._id} className={styles.histRow} style={{ padding: '6px 14px' }}>
        <span className={styles.histDot} />
        <span className={styles.histName}>{historyName(r)}</span>
        {r.danceType === 'partner' && <span className={styles.partnerBadge}>Partner</span>}
        <span className={styles.histAge}>{(() => { const t = timeAgo(r.updatedAt); return t === 'just now' ? t : `${t} ago`; })()}</span>
      </div>
    ))
  );
  const clear = history.length > 0 && (
    <button className={styles.clearHistBtn} style={{ marginLeft: 'auto' }} onClick={onClear}>Clear</button>
  );

  if (bare) return <>{clear && <div style={{ display: 'flex', padding: '0 14px 6px' }}>{clear}</div>}{rows}</>;
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Track History</span>
        {history.length > 0 && <span className={styles.colCount}>{history.length}</span>}
        {clear}
      </div>
      <div className={styles.panelBody} style={{ padding: 0 }}>{rows}</div>
    </div>
  );
}
