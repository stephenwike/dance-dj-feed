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

export default function StartPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState(120);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeSession, setActiveSession] = useState(undefined);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    fetch('/api/dj/sessions')
      .then(r => r.json())
      .then(sessions => {
        const active = Array.isArray(sessions) ? sessions.find(s => s.status === 'active') : null;
        setActiveSession(active ?? null);
      })
      .catch(() => setActiveSession(null));
  }, []);

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
          router.push(CONTROLLER_PATH);
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
        router.push(CONTROLLER_PATH);
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
            <button className={styles.signOutBtn} onClick={() => signOut({ callbackUrl: '/' })}>Sign out</button>
          </div>
          <div className={styles.logo}>🎛️</div>
          <h1 className={styles.title}>Start an Event</h1>
          <p className={styles.sub}>Name your session and choose how long it runs.</p>

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

            <button type="submit" className={styles.btn} disabled={loading}>
              {loading ? 'Starting…' : '▶ Start Event'}
            </button>
          </form>
          </>
          )}
        </div>
      </div>
    </>
  );
}
