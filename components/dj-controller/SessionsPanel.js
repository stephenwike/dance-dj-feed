import { useState } from 'react';
import Link from 'next/link';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { formatDuration, formatTimestamp } from './utils';

export function SessionRow({ session, onContinue, onClose }) {
  const [expanded, setExpanded] = useState(false);
  const [played, setPlayed] = useState(null);

  async function toggle() {
    if (!expanded && played === null) {
      const data = await fetch(`/api/dj/sessions/${session._id}`).then(r => r.json());
      if (data.report?.playedTracks) {
        setPlayed(data.report.playedTracks.map(t => ({
          _id: t.danceId || t.danceName,
          danceName: t.danceName,
          songName: t.songName,
          artist: t.artist,
          difficulty: t.difficulty,
          requesterCount: t.requesterCount,
          updatedAt: t.playedAt,
        })));
      } else {
        const deduped = {};
        for (const r of data.played ?? []) {
          const key = r.danceId || r.danceName;
          if (!deduped[key]) { deduped[key] = { ...r, requesterCount: 1 }; }
          else { deduped[key].requesterCount += 1; }
        }
        setPlayed(Object.values(deduped).sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt)));
      }
    }
    setExpanded(v => !v);
  }

  const duration = session.closedAt
    ? formatDuration(new Date(session.closedAt) - new Date(session.startedAt))
    : 'ongoing';

  return (
    <div className={styles.sessionRow}>
      <div className={styles.sessionRowHead}>
        <div className={styles.sessionRowInfo}>
          <span className={styles.sessionRowName}>{session.name}</span>
          <span className={styles.sessionRowMeta}>
            {new Date(session.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' · '}{duration}
            {session.status === 'active' && <span className={styles.activePip}> · active</span>}
          </span>
        </div>
        <div className={styles.sessionRowActions}>
          {session.status === 'active' && (
            <button className={styles.btnCloseSession} onClick={() => onClose(session._id)}>
              Close
            </button>
          )}
          {session.status === 'closed' && (
            <>
              <Link href={`/reports?session=${session._id}`} className={styles.btnReportLink}>
                Report
              </Link>
              <button className={styles.btnContinue} onClick={() => onContinue(session._id)}>
                Continue
              </button>
            </>
          )}
          <button className={styles.btnExpand} onClick={toggle}>
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className={styles.sessionPlayed}>
          {played === null && <p className={styles.sessionLoading}>Loading…</p>}
          {played?.length === 0 && <p className={styles.sessionEmpty}>No tracks played.</p>}
          {played?.map((r, i) => (
            <div key={r._id ?? i} className={styles.sessionTrack}>
              <span className={styles.sessionTrackNum}>{i + 1}</span>
              <div className={styles.sessionTrackInfo}>
                <span className={styles.sessionTrackName}>{r.danceName}</span>
                {(r.songName || r.artist) && (
                  <span className={styles.sessionTrackSub}>
                    {r.songName}{r.artist ? ` — ${r.artist}` : ''}
                    {r.requesterCount > 1 && ` · ${r.requesterCount} req`}
                  </span>
                )}
              </div>
              <span className={styles.sessionTrackTime}>{formatTimestamp(r.updatedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SessionsPanel({ sessions, onContinue, onCloseSession }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Sessions</span>
        <Link href="/start" className={styles.panelNewSessionBtn}>+ New</Link>
      </div>
      <div className={styles.panelBody} style={{ padding: 0 }}>
        {sessions.length === 0 && (
          <p className={styles.sessionEmpty} style={{ padding: '16px 20px' }}>No sessions yet.</p>
        )}
        <div className={styles.sessionsList}>
          {sessions.map(s => (
            <SessionRow key={s._id} session={s} onContinue={onContinue} onClose={onCloseSession} />
          ))}
        </div>
      </div>
    </div>
  );
}
