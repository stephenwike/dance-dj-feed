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
        <div className={styles.danceGroupRight}>
          {!group.danceId && (
            <button className={styles.btnEdit} onClick={() => onEdit(group)} title="Edit request">✎</button>
          )}
          <button className={styles.countBtn} onClick={() => setExpanded(e => !e)}>
            {group.score.toFixed(1)}
            <span className={styles.countRaw}> · {group.requests.length}</span>
            {group.totalTipCents > 0 && (
              <span className={styles.countTip}> · <img src="/beats/coin_front.png" style={{width:'1.5em',height:'1.5em',verticalAlign:'middle',objectFit:'contain'}} alt="" aria-hidden="true" /> {Math.round(group.totalTipCents / 5)}</span>
            )}
            {' '}{expanded ? '▲' : '▼'}
          </button>
          <button className={styles.btnApprove} onClick={() => onAction(group.requests[0]._id, 'approve')}>
            Queue →
          </button>
          <button className={styles.btnDenyGroup} onClick={() => onAction(key, 'denyGroup', group.requests)}>
            Deny
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
