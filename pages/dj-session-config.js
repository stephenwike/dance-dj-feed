import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import styles from './dj-session-config.module.css';
import { SESSION_DURATIONS } from '../lib/dj/sessionPricing';
import { PAYMENTS_ENABLED } from '../lib/client/dj/useGoLive';
import AppCard from '../components/AppCard';
import MusicSourcePicker from '../components/session/MusicSourcePicker';
import { formatCents } from '../components/session/ChargeSummary';

/**
 * New event: name, length and music source, then Create. The event is saved
 * as a draft and opens as its card on Your events, which is where it's paid
 * for and goes live, its set is planned, and its settings can still change.
 *
 * With ?id= it edits a saved draft (?from=plan returns to Plan the set).
 */
export default function NewEventPage() {
  const router = useRouter();
  const { id, from } = router.query;
  const isEdit = Boolean(id);

  const [name, setName] = useState('');
  const [duration, setDuration] = useState(120);
  const [plugin, setPlugin] = useState('standard');
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setFetching(true);
    fetch(`/api/dj/sessions/${id}`)
      .then(r => r.json())
      .then(data => {
        // Only drafts are edited here; a launched session lives in the controller.
        if (data.status && data.status !== 'draft') { router.replace('/dj-controller'); return; }
        setName(data.name ?? '');
        if (data.durationMinutes) setDuration(data.durationMinutes);
        if (data.plugin) setPlugin(data.plugin);
      })
      .catch(() => setError('Failed to load this event.'))
      .finally(() => setFetching(false));
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Give your event a name.'); return; }
    setSaving(true);
    try {
      const body = JSON.stringify({ name: trimmedName, durationMinutes: duration, plugin });
      const res = isEdit
        ? await fetch(`/api/dj/sessions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
        : await fetch('/api/dj/sessions/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save.'); return; }
      const eventId = isEdit ? id : data.session._id;
      router.push(isEdit && from === 'plan' ? `/dj-plan?id=${eventId}` : `/start?event=${eventId}`);
    } catch {
      setError('Something went wrong. Check your connection.');
    } finally {
      setSaving(false);
    }
  }

  const fromPlan = isEdit && from === 'plan';
  const back = fromPlan ? `/dj-plan?id=${id}` : '/start';
  const backLabel = fromPlan ? '← Plan the set' : '← Your events';

  if (fetching) {
    return (
      <AppCard leftHref={back} leftLabel={backLabel}>
        <p className={styles.sub}>Loading…</p>
      </AppCard>
    );
  }

  return (
    <>
      <Head><title>{isEdit ? 'Edit Event' : 'New Event'}</title></Head>
      <AppCard leftHref={back} leftLabel={backLabel}>
        <div className={styles.logo}>🎛️</div>
        <h1 className={styles.title}>{isEdit ? 'Edit event' : 'New event'}</h1>
        <p className={styles.sub}>
          {isEdit ? 'Change the details of this event.' : 'Set it up. Next you can plan your set or go live.'}
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="event-name">Event name</label>
            <input
              id="event-name"
              className={styles.input}
              type="text"
              placeholder="e.g. Friday Night Dance"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={80}
              autoFocus={!isEdit}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>How long</label>
            <div className={styles.durationRow}>
              {SESSION_DURATIONS.map(t => (
                <button
                  key={t.minutes}
                  type="button"
                  className={`${styles.durationChip} ${duration === t.minutes ? styles.durationChipActive : ''}`}
                  onClick={() => setDuration(t.minutes)}
                >
                  <span className={styles.durationChipLabel}>{t.label}</span>
                  {PAYMENTS_ENABLED && <span className={styles.durationChipPrice}>{formatCents(t.priceCents)}</span>}
                </button>
              ))}
            </div>
            <span className={styles.hint}>You can extend a running event from the controller.</span>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Music source</label>
            <MusicSourcePicker value={plugin} onChange={setPlugin} />
            <span className={styles.hint}>Switch between included sources any time during the event.</span>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button className={styles.btn} type="submit" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create event'}
          </button>
          {!isEdit && (
            <span className={styles.hintCenter}>Nothing is charged yet — you pay when the event goes live.</span>
          )}
        </form>
      </AppCard>
    </>
  );
}
