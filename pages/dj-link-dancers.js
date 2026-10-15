import { useState, useEffect } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { Check } from 'lucide-react';
import styles from './dj-link-dancers.module.css';
import AppCard from '../components/AppCard';
import { fetcher } from '../lib/client/fetcher';

const fmtDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

async function post(body) {
  const res = await fetch('/api/dj/dancer-links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function Tick({ on }) {
  return <span className={`${styles.box} ${on ? styles.boxOn : ''}`} aria-hidden="true">{on && <Check size={13} strokeWidth={3.5} />}</span>;
}

/**
 * Link past dancers: link signed-in dancers from your past events to you, so
 * Line Dance Manager knows they dance with you (e.g. to show you what they
 * want to learn). New events link dancers automatically; this is for events
 * from before that. See lib/server/dj/dancerLinks.js.
 */
export default function LinkDancersPage() {
  const { data, error: loadError, mutate } = useSWR('/api/dj/dancer-links', fetcher, { revalidateOnFocus: false });
  const sessions = data?.sessions;
  const [chosenEvents, setChosenEvents] = useState(() => new Set());
  const [preview, setPreview] = useState(null);          // { dancers, guests } for chosenEvents
  const [chosenDancers, setChosenDancers] = useState(() => new Set());
  const [busy, setBusy] = useState(null);                // 'preview' | 'link'
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);            // { dancers, newLinks, events }

  // Changing the events makes the dancer list stale.
  useEffect(() => { setPreview(null); setResult(null); }, [chosenEvents]);

  const linkable = sessions?.filter(s => s.dancers > 0) ?? [];

  function toggle(set, setSet, key) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSet(next);
  }

  async function findDancers() {
    setBusy('preview'); setError('');
    try {
      const found = await post({ action: 'preview', sessionIds: [...chosenEvents] });
      setPreview(found);
      setChosenDancers(new Set(found.dancers.map(d => d.userId)));
    } catch (err) { setError(err.message); } finally { setBusy(null); }
  }

  async function link() {
    setBusy('link'); setError('');
    try {
      const done = await post({ action: 'link', sessionIds: [...chosenEvents], userIds: [...chosenDancers] });
      setResult(done);
      setPreview(p => p && { ...p, dancers: p.dancers.map(d => (chosenDancers.has(d.userId) ? { ...d, linked: true } : d)) });
      mutate();
    } catch (err) { setError(err.message); } finally { setBusy(null); }
  }

  return (
    <>
      <Head><title>Link Past Dancers</title></Head>
      <AppCard leftHref="/start" leftLabel="← Your events">
        <div className={styles.logo}>🤝</div>
        <h1 className={styles.title}>Link past dancers</h1>
        <p className={styles.sub}>
          Dancers who are signed in at your events are linked to you automatically — that’s how Line Dance
          Manager shows you what your dancers want to learn. Use this for events from before that.
        </p>

        <div className={styles.body}>
          {/* ── 1. Events ── */}
          <section className={styles.step}>
            <div className={styles.stepHead}>
              <span className={styles.stepNum}>1</span>
              <span className={styles.stepTitle}>Choose events</span>
              {linkable.length > 1 && (
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => setChosenEvents(chosenEvents.size === linkable.length ? new Set() : new Set(linkable.map(s => s.id)))}
                >
                  {chosenEvents.size === linkable.length ? 'Clear' : 'Select all'}
                </button>
              )}
            </div>

            {loadError ? <p className={styles.error}>Couldn’t load your events.</p>
              : !sessions ? <p className={styles.muted}>Loading your events…</p>
              : !sessions.length ? <p className={styles.muted}>You don’t have any past events yet.</p>
              : (
                <ul className={styles.list}>
                  {sessions.map(s => {
                    const on = chosenEvents.has(s.id);
                    const usable = s.dancers > 0;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          className={`${styles.row} ${on ? styles.rowOn : ''}`}
                          onClick={() => usable && toggle(chosenEvents, setChosenEvents, s.id)}
                          disabled={!usable}
                          aria-pressed={usable ? on : undefined}
                        >
                          <Tick on={on} />
                          <span className={styles.rowText}>
                            <span className={styles.rowName}>{s.name}</span>
                            <span className={styles.rowMeta}>
                              {fmtDate(s.date)} · {usable ? plural(s.dancers, 'signed-in dancer') : 'no signed-in dancers'}
                              {s.guests > 0 && ` · ${plural(s.guests, 'guest')}`}
                              {s.linked > 0 && <span className={styles.linkedTag}> · {s.linked} linked</span>}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

            <button type="button" className={styles.primary} onClick={findDancers} disabled={!chosenEvents.size || !!busy}>
              {busy === 'preview' ? 'Finding dancers…' : chosenEvents.size ? `Find dancers in ${plural(chosenEvents.size, 'event')}` : 'Choose events above'}
            </button>
          </section>

          {/* ── 2. Dancers ── */}
          {preview && (
            <section className={styles.step}>
              <div className={styles.stepHead}>
                <span className={styles.stepNum}>2</span>
                <span className={styles.stepTitle}>Dancers found</span>
                {preview.dancers.length > 1 && (
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => setChosenDancers(chosenDancers.size === preview.dancers.length ? new Set() : new Set(preview.dancers.map(d => d.userId)))}
                  >
                    {chosenDancers.size === preview.dancers.length ? 'Clear' : 'Select all'}
                  </button>
                )}
              </div>

              {preview.dancers.length ? (
                <ul className={styles.list}>
                  {preview.dancers.map(d => {
                    const on = chosenDancers.has(d.userId);
                    return (
                      <li key={d.userId}>
                        <button
                          type="button"
                          className={`${styles.row} ${on ? styles.rowOn : ''}`}
                          onClick={() => toggle(chosenDancers, setChosenDancers, d.userId)}
                          aria-pressed={on}
                        >
                          <Tick on={on} />
                          <span className={styles.rowText}>
                            <span className={styles.rowName}>
                              {d.name || d.email}
                              {d.linked && <span className={styles.badge}>Linked</span>}
                            </span>
                            <span className={styles.rowMeta}>
                              {d.name && d.email ? `${d.email} · ` : ''}
                              {d.sessions.length === 1 ? d.sessions[0].name : `${d.sessions.length} of these events`}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className={styles.muted}>No signed-in dancers made requests at these events.</p>
              )}

              {preview.guests > 0 && (
                <p className={styles.note}>
                  {preview.guests === 1 ? '1 guest wasn’t' : `${preview.guests} guests weren’t`} signed in, so
                  they can’t be linked. Only dancers who made a request while signed in are found.
                </p>
              )}

              {preview.dancers.length > 0 && (
                <button type="button" className={styles.primary} onClick={link} disabled={!chosenDancers.size || !!busy}>
                  {busy === 'link' ? 'Linking…' : chosenDancers.size ? `Link ${plural(chosenDancers.size, 'dancer')} to you` : 'Choose dancers above'}
                </button>
              )}
            </section>
          )}

          {error && <p className={styles.error}>{error}</p>}

          {result && (
            <p className={styles.done} role="status">
              ✓ Linked {plural(result.dancers, 'dancer')} from {plural(result.events, 'event')}
              {result.newLinks < result.dancers ? ` — ${result.newLinks} new, the rest were already linked.` : '.'}
            </p>
          )}
        </div>
      </AppCard>
    </>
  );
}
