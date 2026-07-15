import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from './start.module.css';
import AppCard from '../components/AppCard';

const CONTROLLER_PATH = '/dj-controller';
const SETUP_PATH = (sessionId) => `/dj-setup?sessionId=${sessionId}`;

function formatDur(minutes) {
  if (!minutes) return null;
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
}

export default function StartPage() {
  const router = useRouter();
  const [activeSession, setActiveSession] = useState(undefined);
  const [draftSessions, setDraftSessions] = useState(undefined);
  const [recentSessions, setRecentSessions] = useState([]);
  const [launchingId, setLaunchingId] = useState(null);
  const [error, setError] = useState('');
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    fetch('/api/dj/sessions')
      .then(r => r.json())
      .then(sessions => {
        const list = Array.isArray(sessions) ? sessions : [];
        setActiveSession(list.find(s => s.status === 'active') ?? null);
        setDraftSessions(list.filter(s => s.status === 'draft'));
        setRecentSessions(list.filter(s => s.status === 'closed' && s.startedAt).slice(0, 5));
      })
      .catch(() => { setActiveSession(null); setDraftSessions([]); });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('session_started')) return;

    window.history.replaceState({}, '', window.location.pathname);
    setFinishing(true);

    const startedAt = Number(sessionStorage.getItem('dj_session_checkout_started_at')) || 0;
    sessionStorage.removeItem('dj_session_checkout_started_at');

    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const res = await fetch('/api/dj/sessions');
        const sessions = await res.json();
        const active = Array.isArray(sessions)
          ? sessions.find(s => s.status === 'active' && new Date(s.startedAt).getTime() >= startedAt - 5000)
          : null;
        if (active) { router.push(SETUP_PATH(active._id)); return; }
      } catch { /* retry */ }
      if (attempts < 5) setTimeout(poll, 2000);
      else {
        setFinishing(false);
        setError('Your payment succeeded, but session setup is taking longer than expected. Refresh in a moment.');
      }
    };
    poll();
  }, [router]);

  async function handleDeleteDraft(draftId) {
    if (!window.confirm('Delete this pre-configured session? This cannot be undone.')) return;
    try {
      await fetch(`/api/dj/sessions/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });
      setDraftSessions(prev => prev.filter(d => d._id !== draftId));
    } catch {
      setError('Failed to delete session. Try again.');
    }
  }

  async function handleLaunch(draftId) {
    setLaunchingId(draftId);
    setError('');
    try {
      const res = await fetch('/api/dj/sessions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: window.location.href, draftSessionId: draftId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to launch session'); return; }
      if (data.url) {
        sessionStorage.setItem('dj_session_checkout_started_at', String(Date.now()));
        window.location.href = data.url;
        return;
      }
      if (data.session) { router.push(SETUP_PATH(data.session._id)); return; }
      setError('Unexpected response from server');
    } catch {
      setError('Something went wrong. Check your connection.');
    } finally {
      setLaunchingId(null);
    }
  }

  const loading = activeSession === undefined || draftSessions === undefined;
  const hasSessions = activeSession || (draftSessions?.length > 0);

  return (
    <>
      <Head><title>Start an Event</title></Head>
      <AppCard leftHref="/my-account" leftLabel="My Account">
          <div className={styles.logo}>🎛️</div>
          <h1 className={styles.title}>Start an Event</h1>

          {finishing ? (
            <div className={styles.finishing}>
              <span className={styles.finishingSpinner} />
              <p>Finishing setup…</p>
            </div>
          ) : loading ? (
            <p className={styles.sub}>Loading…</p>
          ) : (
            <>
              {hasSessions && (
                <div className={styles.sessionList}>
                  {activeSession && (
                    <div className={`${styles.sessionCard} ${styles.sessionCardLive}`}>
                      <div className={styles.sessionCardLeft}>
                        <span className={styles.liveDot} />
                        <div className={styles.sessionCardText}>
                          <span className={styles.sessionCardName}>{activeSession.name}</span>
                          <span className={styles.sessionCardSub}>Live</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.sessionCardAction}
                        onClick={() => router.push(CONTROLLER_PATH)}
                      >
                        Continue →
                      </button>
                    </div>
                  )}

                  {draftSessions.map(d => {
                    const dur = formatDur(d.durationMinutes);
                    const isLaunching = launchingId === d._id;
                    return (
                      <div key={d._id} className={`${styles.sessionCard} ${styles.sessionCardDraft}`}>
                        <div className={styles.sessionCardLeft}>
                          <span className={styles.draftDot} />
                          <div className={styles.sessionCardText}>
                            <span className={styles.sessionCardName}>{d.name}</span>
                            <span className={styles.sessionCardSub}>
                              {dur ? `Pre-configured · ${dur}` : 'Pre-configured · no duration set'}
                            </span>
                          </div>
                        </div>
                        <div className={styles.sessionCardRight}>
                          {dur ? (
                            <button
                              type="button"
                              className={styles.btnLaunch}
                              onClick={() => handleLaunch(d._id)}
                              disabled={isLaunching}
                            >
                              {isLaunching ? '…' : '▶ Launch'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={styles.sessionCardEdit}
                            onClick={() => router.push(`/dj-session-config?id=${d._id}`)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={styles.sessionCardDelete}
                            onClick={() => handleDeleteDraft(d._id)}
                            aria-label="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {error && <p className={styles.error}>{error}</p>}

              <button
                type="button"
                className={styles.btnCreate}
                onClick={() => router.push('/dj-session-config')}
              >
                + Create New Session
              </button>

              {recentSessions.length > 0 && (
                <div className={styles.recentSessions}>
                  <p className={styles.recentSessionsLabel}>Recent sessions</p>
                  {recentSessions.map(s => {
                    const ms = s.closedAt ? new Date(s.closedAt) - new Date(s.startedAt) : null;
                    const dur = ms ? (() => {
                      const h = Math.floor(ms / 3600000);
                      const m = Math.floor((ms % 3600000) / 60000);
                      return h > 0 ? `${h}h ${m}m` : `${m}m`;
                    })() : null;
                    return (
                      <div key={s._id} className={styles.recentSessionRow}>
                        <div className={styles.recentSessionInfo}>
                          <span className={styles.recentSessionName}>{s.name}</span>
                          <span className={styles.recentSessionMeta}>
                            {new Date(s.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {dur && ` · ${dur}`}
                          </span>
                        </div>
                        <Link href={`/reports?session=${s._id}`} className={styles.recentSessionLink}>
                          Report →
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
      </AppCard>
    </>
  );
}
