import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { UserButton } from '@clerk/nextjs';
import styles from './start.module.css';

const PLUGINS = [
  {
    id: 'standard',
    icon: '🎛️',
    name: 'Standard',
    desc: 'Manual queue with full DJ controls. No music source integration.',
    badge: 'Free',
    available: true,
    controller: '/dj-controller',
  },
  {
    id: 'spotify',
    icon: '♬',
    name: 'Spotify',
    desc: 'Queue auto-advances as tracks finish. Syncs with your Spotify account.',
    badge: 'Free',
    available: true,
    controller: '/dj-controller',
  },
  {
    id: 'apple',
    icon: '🎵',
    name: 'Apple Music',
    desc: 'Sync playback with your Apple Music library.',
    badge: null,
    available: false,
    controller: null,
  },
  {
    id: 'local',
    icon: '💿',
    name: 'Local Library',
    desc: 'Play from a local folder or USB drive.',
    badge: null,
    available: false,
    controller: null,
  },
];

function pluginController(pluginId) {
  return PLUGINS.find(p => p.id === pluginId)?.controller ?? '/dj-controller';
}

export default function StartPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [plugin, setPlugin] = useState('standard');
  const [duration, setDuration] = useState(120);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeSession, setActiveSession] = useState(undefined);

  useEffect(() => {
    fetch('/api/dj/sessions')
      .then(r => r.json())
      .then(sessions => {
        const active = Array.isArray(sessions) ? sessions.find(s => s.status === 'active') : null;
        setActiveSession(active ?? null);
      })
      .catch(() => setActiveSession(null));
  }, []);

  async function handleStart(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/dj/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined, plugin, durationMinutes: duration }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to start session');
        return;
      }
      router.push(pluginController(plugin));
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
            <UserButton afterSignOutUrl="/" />
          </div>
          <div className={styles.logo}>🎛️</div>
          <h1 className={styles.title}>Start an Event</h1>
          <p className={styles.sub}>Name your session and choose a music source.</p>

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
                onClick={() => router.push(pluginController(activeSession.plugin))}
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
                {[60, 120, 180, 240].map(mins => (
                  <button
                    key={mins}
                    type="button"
                    className={`${styles.durationChip} ${duration === mins ? styles.durationChipActive : ''}`}
                    onClick={() => setDuration(mins)}
                  >
                    {mins / 60 === 1 ? '1 hr' : `${mins / 60} hrs`}
                  </button>
                ))}
              </div>
              <span className={styles.hint}>Free during beta</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Music source</label>
              <div className={styles.pluginGrid}>
                {PLUGINS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!p.available}
                    className={[
                      styles.pluginCard,
                      plugin === p.id && p.available ? styles.pluginCardSelected : '',
                      !p.available ? styles.pluginCardDisabled : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => p.available && setPlugin(p.id)}
                  >
                    <span className={styles.pluginIcon}>{p.icon}</span>
                    <span className={styles.pluginName}>{p.name}</span>
                    <span className={styles.pluginDesc}>
                      {p.available ? p.desc : 'Coming soon'}
                    </span>
                    <span className={p.available ? styles.pluginBadge : styles.pluginBadgeSoon}>
                      {p.available ? p.badge : 'Soon'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" className={styles.btn} disabled={loading}>
              {loading ? 'Starting…' : '▶ Start Event'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
