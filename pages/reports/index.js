import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import styles from './reports.module.css';

const fetcher = url => fetch(url).then(r => r.json());

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const DIFF_COLORS = {
  beginner: '#22c55e', improver: '#3b82f6',
  intermediate: '#f59e0b', advanced: '#ef4444',
};
function diffColor(d = '') {
  const key = Object.keys(DIFF_COLORS).find(k => d.toLowerCase().includes(k));
  return key ? DIFF_COLORS[key] : '#8A5CFF';
}

function SessionDetail({ sessionId }) {
  const [showPartner, setShowPartner] = useState(true);
  const [showCustom, setShowCustom] = useState(true);
  const [exporting, setExporting] = useState(false);
  const captureRef = useRef(null);

  async function saveImage() {
    if (!captureRef.current) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(captureRef.current, {
        backgroundColor: '#0e0e18',
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `${data.name.replace(/[^a-z0-9]/gi, '_')}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setExporting(false);
    }
  }
  const { data, isLoading } = useSWR(
    sessionId ? `/api/dj/sessions/${sessionId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (isLoading) return <p className={styles.loading}>Loading…</p>;
  if (!data) return null;

  // Deduplicate by dance, keeping the earliest play time and counting requesters
  const played = (() => {
    if (data.report?.playedTracks) {
      // Already deduplicated — normalize shape to match live fields
      return data.report.playedTracks.map(t => ({
        ...t,
        updatedAt: t.playedAt,
        requesters: t.requesterCount,
      }));
    }
    const map = {};
    for (const r of data.played ?? []) {
      const key = r.danceId || r.danceName;
      if (!map[key]) {
        map[key] = { ...r, requesters: 1 };
      } else {
        map[key].requesters += 1;
        if (new Date(r.updatedAt) < new Date(map[key].updatedAt)) {
          map[key].updatedAt = r.updatedAt;
        }
      }
    }
    return Object.values(map).sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
  })();

  return (
    <div className={styles.detail}>
      <div ref={captureRef} className={styles.captureArea}>
      <div className={styles.detailHeader}>
        <div>
          <h2 className={styles.detailTitle}>{data.name}</h2>
          <p className={styles.detailMeta}>
            {formatDate(data.startedAt)}
            {data.closedAt && ` · ${formatDuration(new Date(data.closedAt) - new Date(data.startedAt))}`}
            {' · '}{played.length} dance{played.length !== 1 ? 's' : ''} played
          </p>
        </div>
        <div className={styles.detailActions}>
          <span className={`${styles.statusPip} ${data.status === 'active' ? styles.statusActive : styles.statusClosed}`}>
            {data.status === 'active' ? 'Active' : 'Closed'}
          </span>
          <button className={styles.exportBtn} onClick={() => window.print()}>
            ↓ Export PDF
          </button>
          <button className={styles.exportBtn} onClick={saveImage} disabled={exporting}>
            {exporting ? 'Saving…' : '↓ Save Image'}
          </button>
        </div>
      </div>

      <div className={styles.filterBar}>
        <button className={styles.filterBtn} onClick={() => setShowPartner(v => !v)}>
          <span className={styles.filterCheck}>{showPartner ? '✓' : ' '}</span>
          Partner dances
        </button>
        <button className={styles.filterBtn} onClick={() => setShowCustom(v => !v)}>
          <span className={styles.filterCheck}>{showCustom ? '✓' : ' '}</span>
          Custom requests
        </button>
      </div>

      {played.length === 0 ? (
        <p className={styles.empty}>No dances were played in this session.</p>
      ) : (
        <ol className={styles.trackList}>
          {played.filter(r =>
            (showPartner || r.danceType !== 'partner') &&
            (showCustom  || r.danceId)
          ).map((r, i) => (
            <li key={r._id} className={styles.trackRow}>
              <span className={styles.trackNum}>{i + 1}</span>
              <div className={styles.trackInfo}>
                <div className={styles.trackPrimary}>
                  <span className={styles.trackName}>
                    {r.stepsheet
                      ? <a href={r.stepsheet} target="_blank" rel="noopener noreferrer" className={styles.trackLink}>{r.danceName}</a>
                      : r.danceName}
                  </span>
                  <span className={styles.trackTime}>{formatTime(r.updatedAt)}</span>
                </div>
                <div className={styles.trackSecondary}>
                  {r.songName && <span>{r.songName}{r.artist ? ` — ${r.artist}` : ''}</span>}
                  {r.difficulty && <span className={styles.diffPip} style={{ background: diffColor(r.difficulty) }}>{r.difficulty}</span>}
                  {r.danceType === 'partner' && (
                    <span className={styles.partnerTag}>👫{r.partnerStyle ? ` ${r.partnerStyle}` : ' Partner'}</span>
                  )}
                  {r.requesters > 1 && <span className={styles.requesterCount}>{r.requesters} req</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      </div> {/* end captureArea */}
    </div>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (router.query.session) setSelectedId(router.query.session);
  }, [router.query.session]);

  const { data: sessions = [], isLoading } = useSWR('/api/dj/sessions', fetcher, {
    revalidateOnFocus: false,
  });

  return (
    <>
      <Head>
        <title>Session Reports</title>
        <style>{`@media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }`}</style>
      </Head>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.appName}>📊 Session Reports</h1>
        </header>

        <div className={styles.layout}>
          {/* Session list */}
          <aside className={styles.sidebar}>
            <p className={styles.sidebarLabel}>Sessions</p>
            {isLoading && <p className={styles.loading}>Loading…</p>}
            {!isLoading && sessions.length === 0 && (
              <p className={styles.empty}>No sessions yet.</p>
            )}
            {sessions.map(s => {
              const duration = s.closedAt
                ? formatDuration(new Date(s.closedAt) - new Date(s.startedAt))
                : null;
              return (
                <button
                  key={s._id}
                  className={`${styles.sessionBtn} ${selectedId === s._id ? styles.sessionBtnActive : ''}`}
                  onClick={() => setSelectedId(s._id)}
                >
                  <div className={styles.sessionBtnTop}>
                    <span className={styles.sessionBtnName}>{s.name}</span>
                    {s.status === 'active' && <span className={styles.activeDot} />}
                  </div>
                  <span className={styles.sessionBtnMeta}>
                    {formatDate(s.startedAt)}{duration ? ` · ${duration}` : ''}
                  </span>
                </button>
              );
            })}
          </aside>

          {/* Detail panel */}
          <main className={styles.main}>
            {!selectedId ? (
              <div className={styles.placeholder}>
                <span className={styles.placeholderIcon}>📋</span>
                <p>Select a session to view the playlist</p>
              </div>
            ) : (
              <SessionDetail sessionId={selectedId} />
            )}
          </main>
        </div>
      </div>
    </>
  );
}
