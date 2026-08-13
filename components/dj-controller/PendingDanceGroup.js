import { useState } from 'react';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { diffColor, timeAgo } from './utils';

export default function PendingDanceGroup({ group, playsPerClient, resolvedNames, onAction, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const key = group.danceId || group.danceName;

  return (
    <div className={styles.danceGroup}>
      <div className={styles.danceGroupRow}>
        <div className={styles.danceGroupInfo}>
          <span className={styles.danceGroupName}>
            {group.danceType === 'partner'
              ? (group.songName
                  ? <>{group.songName}{group.artist ? <span className={styles.danceGroupNameArtist}> — {group.artist}</span> : ''}</>
                  : (group.partnerStyle || 'Partner Dance'))
              : (group.stepsheet
                  ? <a href={group.stepsheet} target="_blank" rel="noopener noreferrer" className={styles.pNameLink}>{group.danceName}</a>
                  : group.danceName)}
            {group.isRepeat && <span className={styles.repeatBadge}>REPEAT</span>}
            {group.isSongSwap && <span className={styles.swapBadgePending}>↻ Swap</span>}
          </span>
          {group.isSongSwap && group.swapSongName && (
            <div className={styles.danceGroupSwap}>
              ↪ {group.swapSongName}{group.swapArtist ? ` — ${group.swapArtist}` : ''}
            </div>
          )}
          <div className={styles.danceGroupSub}>
            {group.danceType === 'partner'
              ? <span className={styles.partnerBadge}>Partner Dance</span>
              : <>
                  {group.difficulty && <span className={styles.diffPip} style={{ background: diffColor(group.difficulty) }}>{group.difficulty}</span>}
                  {!group.isSongSwap && group.songName && <span className={styles.danceGroupSong}>{group.songName}{group.artist ? ` — ${group.artist}` : ''}</span>}
                </>
            }
          </div>
        </div>
      </div>
      <div className={styles.pendingPanel}>
          <button className={styles.pendingStatsBtn} onClick={() => setExpanded(e => !e)} title={expanded ? 'Collapse' : 'Expand requests'}>
            <span className={styles.pendingStatCell}>
              <span aria-hidden="true">★</span>
              {group.score.toFixed(1)}
            </span>
            <span className={styles.pendingStatCell}>
              <svg width="12" height="10" viewBox="0 0 24 22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 11c1.66 0 3-1.34 3-3s-1.34-3-3-3"/>
                <path d="M21 21c0-2.76-2.24-5-5-5h-.5"/>
                <circle cx="9" cy="8" r="3"/>
                <path d="M3 21c0-2.76 2.24-5 5-5h2c2.76 0 5 2.24 5 5"/>
              </svg>
              {group.requests.length}
            </span>
            <span className={styles.pendingStatCell}>
              <img src="/beats/coin_front.png" style={{width:'1em',height:'1em',objectFit:'contain'}} alt="" aria-hidden="true" />
              {group.totalTipCents > 0 ? Math.round(group.totalTipCents / 5) : '—'}
            </span>
          </button>
          <div className={styles.pendingActionsRow}>
            <button className={`${styles.pendingActionBtn} ${styles.actionCellEdit}`} onClick={() => onEdit(group)} title="Edit this request">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit
            </button>
            <button className={`${styles.pendingActionBtn} ${styles.actionCellDeny}`} onClick={() => onAction(key, 'denyGroup', group.requests)} title="Deny — remove all requests for this dance">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" aria-hidden="true">
                <line x1="4" y1="4" x2="20" y2="20"/>
                <line x1="20" y1="4" x2="4" y2="20"/>
              </svg>
              Deny
            </button>
            <button className={`${styles.pendingActionBtn} ${styles.actionCellQueue}`} onClick={() => onAction(group.requests[0]._id, 'approve')} title="Add to queue">
              <svg width="12" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="3" y1="12" x2="21" y2="12"/>
                <polyline points="15 6 21 12 15 18"/>
              </svg>
              Queue
            </button>
          </div>
        </div>
      {expanded && (
        <ul className={styles.danceExpanded}>
          {group.requests.map(r => {
            const plays = playsPerClient[r.clientId] ?? 0;
            const weight = 1 / (1 + plays);
            const tip = r.tipCents ?? 0;
            return (
              <li key={r._id} className={styles.danceExpandedRow}>
                <span className={styles.expandedWho}>{resolvedNames[r.clientId] || r.requesterName || r.clientId || 'Anonymous'}</span>
                <span className={styles.weightChip} title={`${plays} dance${plays !== 1 ? 's' : ''} played this session`}>×{weight.toFixed(2)}</span>
                {tip > 0 && <span className={styles.tipChip}><img src="/beats/coin_front.png" style={{width:'1.4em',height:'1.4em',verticalAlign:'middle',objectFit:'contain',marginRight:'2px'}} alt="" aria-hidden="true" />{Math.round(tip / 5)}</span>}
                <span className={styles.qAge}>{timeAgo(r.createdAt)}</span>
                <button className={styles.btnSkipSm} onClick={() => onAction(r._id, 'skip')}>Skip</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
