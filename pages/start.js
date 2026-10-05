import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from './start.module.css';
import AppCard from '../components/AppCard';
import { SESSION_DURATIONS_BY_MINUTES } from '../lib/dj/sessionPricing';
import { musicSource } from '../lib/dj/musicSources';

const NEW_EVENT_PATH = '/dj-session-config';

/**
 * Your events: live events (open the controller), events not started yet
 * (edit, plan the set, start the session, delete), recent events (reports),
 * and + New event. ?event=<id> highlights an event just created.
 */
export default function StartPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState(undefined);
  const [error, setError] = useState('');
  const createdId = typeof router.query.event === 'string' ? router.query.event : null;

  useEffect(() => {
    // Stripe used to return here after paying; the controller handles it now.
    if (new URLSearchParams(window.location.search).get('session_started')) {
      router.replace('/dj-controller?session_started=1');
      return;
    }
    fetch('/api/dj/sessions')
      .then(r => r.json())
      .then(list => setSessions(Array.isArray(list) ? list : []))
      .catch(() => setSessions([]));
  }, []);

  async function handleDeleteDraft(draft) {
    if (!window.confirm(`Delete the draft "${draft.name}" and its planned set? This cannot be undone.`)) return;
    try {
      await fetch(`/api/dj/sessions/${draft._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });
      setSessions(prev => prev.filter(s => s._id !== draft._id));
    } catch {
      setError('Failed to delete the draft. Try again.');
    }
  }

  const live = sessions?.filter(s => s.status === 'active') ?? [];
  const drafts = sessions?.filter(s => s.status === 'draft') ?? [];
  const recent = sessions?.filter(s => s.status === 'closed' && s.startedAt).slice(0, 5) ?? [];

  return (
    <>
      <Head><title>Your Events</title></Head>
      <AppCard leftHref="/my-account" leftLabel="My Account">
        <div className={styles.logo}>🎛️</div>
        <h1 className={styles.title}>Your events</h1>

        {sessions === undefined ? (
          <p className={styles.sub}>Loading…</p>
        ) : (
          <>
            {(live.length > 0 || drafts.length > 0) && (
              <div className={styles.eventList}>
                {live.map(s => (
                  <div key={s._id} className={styles.eventCard}>
                    <div className={styles.eventInfo}>
                      <span className={styles.liveDot} />
                      <div className={styles.eventText}>
                        <span className={styles.eventName}>{s.name}</span>
                        <span className={`${styles.eventMeta} ${styles.eventMetaLive}`}>Live · {musicSource(s.plugin).label}</span>
                      </div>
                    </div>
                    <div className={styles.eventActions}>
                      <Link href={`/dj-controller?session=${s._id}`} className={styles.actionPrimary}>Open controller →</Link>
                    </div>
                  </div>
                ))}

                {drafts.map(d => (
                  <DraftCard
                    key={d._id}
                    draft={d}
                    justCreated={d._id === createdId}
                    onDelete={() => handleDeleteDraft(d)}
                  />
                ))}
              </div>
            )}

            {error && <p className={styles.error}>{error}</p>}

            <button type="button" className={styles.btnCreate} onClick={() => router.push(NEW_EVENT_PATH)}>
              + New event
            </button>

            {recent.length > 0 && (
              <div className={styles.recentSessions}>
                <p className={styles.recentSessionsLabel}>Recent events</p>
                {recent.map(s => {
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

/**
 * An event that isn't live yet, on one line: name and details (with Edit,
 * which reopens the event form, and Delete), then Plan set and Start.
 */
function DraftCard({ draft, justCreated, onDelete }) {
  const tier = SESSION_DURATIONS_BY_MINUTES[draft.durationMinutes];
  const ref = useRef(null);
  useEffect(() => { if (justCreated) ref.current?.scrollIntoView({ block: 'center' }); }, [justCreated]);

  return (
    <div ref={ref} className={styles.eventCard}>
      <div className={styles.eventInfo}>
        <span className={styles.idleDot} />
        <div className={styles.eventText}>
          <span className={styles.eventName}>{draft.name}</span>
          <span className={styles.eventMeta}>
            {justCreated ? 'Created' : 'Not started'} · {tier ? tier.label : 'no length'} · {musicSource(draft.plugin).label}
            {' · '}<Link href={`${NEW_EVENT_PATH}?id=${draft._id}`} className={styles.metaLink}>Edit</Link>
            {' · '}<button type="button" className={styles.metaLink} onClick={onDelete}>Delete</button>
          </span>
        </div>
      </div>
      <div className={styles.eventActions}>
        <Link href={`/dj-plan?id=${draft._id}`} className={styles.actionBtn}>Plan set</Link>
        <Link href={`/dj-start-session?id=${draft._id}`} className={styles.actionPrimary}>▶ Start</Link>
      </div>
    </div>
  );
}
