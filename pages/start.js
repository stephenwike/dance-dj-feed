import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import styles from './start.module.css';
import { SESSION_DURATIONS } from '../lib/dj/sessionPricing';

// Standard is the only available music source for now. Spotify, Apple Music,
// and other source integrations are noted in the UI as future paid add-ons.
const CONTROLLER_PATH = '/dj-controller';
const SETUP_PATH = (sessionId) => `/dj-setup?sessionId=${sessionId}`;

export default function StartPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState(120);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeSession, setActiveSession] = useState(undefined);
  const [draftSession, setDraftSession] = useState(undefined);
  const [recentSessions, setRecentSessions] = useState([]);
  const [finishing, setFinishing] = useState(false);
  const [settingUp, setSettingUp] = useState(false);

  useEffect(() => {
    fetch('/api/dj/sessions')
      .then(r => r.json())
      .then(sessions => {
        const list = Array.isArray(sessions) ? sessions : [];
        const active = list.find(s => s.status === 'active') ?? null;
        const draft = list.find(s => s.status === 'draft') ?? null;
        setActiveSession(active);
        setDraftSession(draft);
        setRecentSessions(list.filter(s => s.status === 'closed' && s.startedAt).slice(0, 5));
        // Pre-fill the name field from the draft so activation preserves the name
        if (draft && !name) setName(draft.name);
      })
      .catch(() => { setActiveSession(null); setDraftSession(null); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect return from Stripe Checkout (real-payments branch) and poll for
  // the session created by the webhook.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('session_started')) return;

    window.history.replaceState({}, '', window.location.pathname);
    setFinishing(true);

    const startedAt = Number(sessionStorage.getItem('dj_session_checkout_started_at')) || 0;
    sessionStorage.removeItem('dj_session_checkout_started_at');

    let attempts = 0;
    const maxAttempts = 5;

    const poll = async () => {
      attempts += 1;
      try {
        const res = await fetch('/api/dj/sessions');
        const sessions = await res.json();
        const active = Array.isArray(sessions)
          ? sessions.find(s => s.status === 'active' && new Date(s.startedAt).getTime() >= startedAt - 5000)
          : null;
        if (active) {
          router.push(SETUP_PATH(active._id));
          return;
        }
      } catch { /* retry */ }

      if (attempts < maxAttempts) {
        setTimeout(poll, 2000);
      } else {
        setFinishing(false);
        setError('Your payment succeeded, but session setup is taking longer than expected. Refresh this page in a moment.');
      }
    };

    poll();
  }, [router]);

  async function handleSetupFirst() {
    setSettingUp(true);
    setError('');
    try {
      const res = await fetch('/api/dj/sessions/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create setup session'); return; }
      router.push(CONTROLLER_PATH);
    } catch {
      setError('Something went wrong. Check your connection.');
    } finally {
      setSettingUp(false);
    }
  }

  async function handleStart(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/dj/sessions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          durationMinutes: duration,
          returnUrl: window.location.href,
          draftSessionId: draftSession?._id ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to start session');
        return;
      }
      if (data.url) {
        sessionStorage.setItem('dj_session_checkout_started_at', String(Date.now()));
        window.location.href = data.url;
        return;
      }
      if (data.session) {
        router.push(SETUP_PATH(data.session._id));
        return;
      }
      setError('Unexpected response from server');
    } catch {
      setError('Something went wrong. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head><title>Start an Event</title></Head>
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <Link href="/dj-profile" className={styles.profileLink}>Wallet &amp; Payouts</Link>
            <Link href="/reports" className={styles.profileLink}>Reports</Link>
            <button className={styles.signOutBtn} onClick={() => signOut({ callbackUrl: '/' })}>Sign out</button>
          </div>
          <div className={styles.logo}>🎛️</div>
          <h1 className={styles.title}>Start an Event</h1>
          <p className={styles.sub}>Name your session and choose how long it runs.</p>

          <div className={styles.howItWorks}>
            <div className={styles.howStep}>
              <span className={styles.howIcon}>🖥️</span>
              <span className={styles.howLabel}>Open the feed on a projector — attendees see the QR code and live queue</span>
            </div>
            <div className={styles.howStep}>
              <span className={styles.howIcon}>📱</span>
              <span className={styles.howLabel}>Attendees scan with their phone to request dances — no app needed</span>
            </div>
            <div className={styles.howStep}>
              <span className={styles.howIcon}>🎛️</span>
              <span className={styles.howLabel}>You approve requests and manage the queue from your controller</span>
            </div>
          </div>

          {finishing ? (
            <div className={styles.finishing}>
              <span className={styles.finishingSpinner} />
              <p>Finishing setup…</p>
            </div>
          ) : (
          <>
          {activeSession && (
            <div className={styles.resumeNotice}>
              <div className={styles.resumeLeft}>
                <span className={styles.resumeDot} />
                <div className={styles.resumeText}>
                  <span className={styles.resumeName}>{activeSession.name}</span>
                  <span className={styles.resumeSub}>active session</span>
                </div>
              </div>
              <button
                type="button"
                className={styles.resumeBtn}
                onClick={() => router.push(CONTROLLER_PATH)}
              >
                Continue →
              </button>
            </div>
          )}

          {!activeSession && draftSession && (
            <div className={styles.resumeNotice}>
              <div className={styles.resumeLeft}>
                <span className={styles.resumeDraftDot} />
                <div className={styles.resumeText}>
                  <span className={styles.resumeName}>{draftSession.name}</span>
                  <span className={styles.resumeSub}>queue setup in progress</span>
                </div>
              </div>
              <button
                type="button"
                className={styles.resumeBtn}
                onClick={() => router.push(CONTROLLER_PATH)}
              >
                Back to controller →
              </button>
            </div>
          )}

          <form onSubmit={handleStart} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Session name</label>
              <input
                className={styles.input}
                type="text"
                placeholder="e.g. Friday Night Dance"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={80}
              />
              <span className={styles.hint}>Leave blank to use today&apos;s date</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Duration</label>
              <div className={styles.durationRow}>
                {SESSION_DURATIONS.map(tier => (
                  <button
                    key={tier.minutes}
                    type="button"
                    className={`${styles.durationChip} ${duration === tier.minutes ? styles.durationChipActive : ''}`}
                    onClick={() => setDuration(tier.minutes)}
                  >
                    <span className={styles.durationChipLabel}>{tier.label}</span>
                    <span className={styles.durationChipPrice}>${tier.priceCents / 100}</span>
                  </button>
                ))}
              </div>
              <span className={styles.hint}>
                {process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true'
                  ? 'One-time charge for the session duration you select.'
                  : 'Free during testing — payments not yet enabled.'}
              </span>
            </div>

            <p className={styles.pluginNote}>
              This release runs on the Standard music source — a manual queue with full DJ
              controls. Spotify, Apple Music, Local Library, and other source integrations are
              in development and will be available as optional paid add-ons in a future release.
            </p>

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" className={styles.btn} disabled={loading || settingUp}>
              {loading ? 'Starting…' : '▶ Start Event'}
            </button>
            <button
              type="button"
              className={styles.btnSetup}
              disabled={loading || settingUp}
              onClick={handleSetupFirst}
            >
              {settingUp ? 'Opening…' : '🎛️ Set up queue first'}
            </button>
          </form>

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
        </div>
      </div>
    </>
  );
}
