import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import styles from './dj-session-config.module.css';
import { SESSION_DURATIONS } from '../lib/dj/sessionPricing';
import AppCard from '../components/AppCard';

export default function SessionConfigPage() {
  const router = useRouter();
  const { id } = router.query;
  const isEdit = Boolean(id);

  const [name, setName] = useState('');
  const [duration, setDuration] = useState(120);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setFetching(true);
    fetch(`/api/dj/sessions/${id}`)
      .then(r => r.json())
      .then(data => {
        setName(data.name ?? '');
        if (data.durationMinutes) setDuration(data.durationMinutes);
      })
      .catch(() => setError('Failed to load session.'))
      .finally(() => setFetching(false));
  }, [id]);

  async function save() {
    setError('');
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Session name is required.'); return null; }

    if (isEdit) {
      const res = await fetch(`/api/dj/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, durationMinutes: duration }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save.'); return null; }
      return id;
    } else {
      const res = await fetch('/api/dj/sessions/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, durationMinutes: duration }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create session.'); return null; }
      return data.session._id;
    }
  }

  async function handleSaveAndQueue() {
    setLoading(true);
    const savedId = await save();
    setLoading(false);
    if (savedId) router.push('/dj-controller');
  }

  async function handleSaveDone() {
    setLoading(true);
    const savedId = await save();
    setLoading(false);
    if (savedId) router.push('/start');
  }

  if (fetching) {
    return (
      <AppCard leftHref="/start" leftLabel="← Back">
        <p className={styles.sub}>Loading…</p>
      </AppCard>
    );
  }

  return (
    <>
      <Head><title>{isEdit ? 'Edit Session' : 'New Session'}</title></Head>
      <AppCard leftHref="/start" leftLabel="← Back">
          <div className={styles.logo}>🎛️</div>
          <h1 className={styles.title}>{isEdit ? 'Edit Session' : 'New Session'}</h1>
          <p className={styles.sub}>
            {isEdit
              ? 'Update this session\'s name, duration, and settings.'
              : 'Give this session a name and configure how long it runs.'}
          </p>

          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Session name</label>
              <input
                className={styles.input}
                type="text"
                placeholder="e.g. Friday Night Dance"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={80}
                autoFocus
              />
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
                  ? 'One-time charge when you launch this session.'
                  : 'Free during testing — payments not yet enabled.'}
              </span>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button className={styles.btn} type="button" onClick={handleSaveAndQueue} disabled={loading}>
              {loading ? 'Saving…' : '🎛️ Save & Set Up Queue'}
            </button>
            <button className={styles.btnSecondary} type="button" onClick={handleSaveDone} disabled={loading}>
              {loading ? 'Saving…' : 'Save & Done'}
            </button>
          </div>
      </AppCard>
    </>
  );
}
