import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { signOut } from 'next-auth/react';
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from '../dj-controller/dj-controller.module.css';
import sp from './dj-spotify.module.css';
import { buildPendingGroups } from '../../lib/client/dj/pendingGroups';
import { buildPlaysPerClient } from '../../lib/client/dj/fairnessScore';
import { SpotifyAdapter } from '../../lib/client/dj/controllerAdapters';

const fetcher = url => fetch(url).then(r => r.json());

function fmtMs(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}
function diffColor(d = '') {
  const map = { beginner: '#22c55e', improver: '#3b82f6', intermediate: '#f59e0b', advanced: '#ef4444' };
  const key = Object.keys(map).find(k => d.toLowerCase().includes(k));
  return key ? map[key] : '#8A5CFF';
}

async function patchReq(id, body) {
  await fetch(`/api/dj/requests/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
async function deleteReq(id) {
  await fetch(`/api/dj/requests/${id}`, { method: 'DELETE' });
}
async function spotifyCmd(method, body) {
  const res = await fetch('/api/spotify/player', {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Spotify ${res.status}`);
  return data;
}

// ── Spotify Now Playing Panel ─────────────────────────────────────────────────
function SpotifyPanel({ data, onControl, connected, error, onRetry }) {
  if (!connected) {
    return (
      <div className={sp.spotifyPanel}>
        <p className={sp.spotifyNotConnected}>Spotify not connected</p>
        <a href="/api/spotify/auth" className={sp.connectBtn}>Connect Spotify</a>
      </div>
    );
  }

  if (error?.toLowerCase().includes('no active device')) {
    return (
      <div className={sp.spotifyPanel}>
        <p className={sp.spotifyNotConnected}>No active Spotify device</p>
        <p className={sp.spotifyHint}>Open Spotify on any device, then retry.</p>
        <div className={sp.spotifyControls}>
          <a href="https://open.spotify.com" target="_blank" rel="noopener noreferrer" className={sp.connectBtn}>Open Spotify</a>
          <button className={sp.retryBtn} onClick={onRetry}>Retry</button>
        </div>
      </div>
    );
  }

  const pb = data?.playback;
  const track = pb?.item;
  const isPlaying = pb?.is_playing;
  const progress = track ? (pb.progress_ms / track.duration_ms) * 100 : 0;

  return (
    <div className={sp.spotifyPanel}>
      <div className={sp.spotifyTrackRow}>
        {track?.album?.images?.[2] && (
          <img className={sp.albumArt} src={track.album.images[2].url} alt="" />
        )}
        <div className={sp.spotifyTrackInfo}>
          <span className={sp.spotifyTrackName}>{track?.name ?? 'Nothing playing'}</span>
          <span className={sp.spotifyTrackArtist}>{track?.artists?.map(a => a.name).join(', ') ?? ''}</span>
        </div>
        <span className={sp.spotifyDuration}>
          {track ? `${fmtMs(pb.progress_ms)} / ${fmtMs(track.duration_ms)}` : ''}
        </span>
      </div>
      {track && (
        <div className={sp.spotifyProgress}>
          <div className={sp.spotifyProgressFill} style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className={sp.spotifyControls}>
        <button className={sp.ctrlBtn} onClick={() => onControl('previous')}>⏮</button>
        <button className={`${sp.ctrlBtn} ${sp.ctrlBtnMain}`} onClick={() => onControl(isPlaying ? 'pause' : 'play')}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button className={sp.ctrlBtn} onClick={() => onControl('next')}>⏭</button>
      </div>
    </div>
  );
}

// ── Spotify Track Search ──────────────────────────────────────────────────────
function SpotifySearch({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  async function search(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    const data = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => []);
    setResults(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  if (!open) return (
    <button className={sp.searchToggle} onClick={() => setOpen(true)}>+ Add from Spotify</button>
  );

  return (
    <div className={sp.searchPanel}>
      <form onSubmit={search} className={sp.searchForm}>
        <input className={sp.searchInput} value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search Spotify…" autoFocus />
        <button type="submit" className={sp.searchBtn} disabled={loading}>{loading ? '…' : 'Search'}</button>
        <button type="button" className={sp.searchClose} onClick={() => { setOpen(false); setResults([]); setQ(''); }}>✕</button>
      </form>
      {results.length > 0 && (
        <ul className={sp.searchResults}>
          {results.map(t => (
            <li key={t.id}>
              <button className={sp.searchResult} onClick={() => { onAdd(t); setOpen(false); setResults([]); setQ(''); }}>
                {t.image && <img src={t.image} className={sp.searchThumb} alt="" />}
                <div className={sp.searchResultInfo}>
                  <span className={sp.searchResultName}>{t.name}</span>
                  <span className={sp.searchResultArtist}>{t.artists}</span>
                </div>
                <span className={sp.searchResultDur}>{fmtMs(t.duration_ms)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main Controller ───────────────────────────────────────────────────────────
function SortableQueueCard({ request, onPlayed, onRemove, requesterCount }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: request._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const r = request;
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className={styles.qCard}>
        <div className={styles.qGrip} {...listeners}>⠿</div>
        <div className={styles.qInfo}>
          <div className={styles.qName}>
            {r.danceName}
            {r.spotifyUri && <span className={sp.spotifyDot} title="Linked to Spotify">♪</span>}
          </div>
          {r.songName && <div className={styles.qSong}>{r.songName}{r.artist ? ` — ${r.artist}` : ''}</div>}
          <div className={styles.qMeta}>
            {r.difficulty && (
              <span className={styles.diffPip} style={{ background: diffColor(r.difficulty) }}>{r.difficulty}</span>
            )}
            {requesterCount > 1
              ? <span className={styles.queueCountBadge}>{requesterCount}</span>
              : r.clientId && r.clientId !== 'dj' && r.clientId !== 'spotify' && (
                <span className={styles.qWho}>{r.requesterName || r.clientId}</span>
              )
            }
          </div>
        </div>
        <div className={styles.qActions}>
          <button className={styles.btnPlayed} onClick={() => onPlayed(r._id)}>✓ Played</button>
          <button className={styles.btnRemove} onClick={() => onRemove(r._id)}>✕</button>
        </div>
      </div>
    </div>
  );
}

function Controller({ spotifyConnected }) {
  const [pendingTab, setPendingTab] = useState('dances');
  const [expandedDances, setExpandedDances] = useState(new Set());
  const [spotifyData, setSpotifyData] = useState(null);
  const [spotifyError, setSpotifyError] = useState(null);
  const allRequestsRef = useRef([]);
  const lastTrackUriRef = useRef(null);
  const queuedAheadRef = useRef(null);   // _id of the track already added to Spotify user queue
  const aheadTimerRef = useRef(null);    // setTimeout handle for the ahead-queue firing

  // Sessions
  const { data: sessions = [], mutate: mutateSessions } = useSWR(
    '/api/dj/sessions', fetcher, { refreshInterval: 30000 }
  );
  const activeSession = sessions.find(s => s.status === 'active') ?? null;

  // Requests
  const { data: rawRequests = [], mutate } = useSWR('/api/dj/requests', fetcher, {
    refreshInterval: 5000, dedupingInterval: 2000,
  });

  const pending = useMemo(() =>
    rawRequests.filter(r => r.status === 'pending')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [rawRequests]);

  const playing = useMemo(() =>
    rawRequests.filter(r => r.status === 'playing'),
    [rawRequests]);

  const queue = useMemo(() =>
    rawRequests.filter(r => r.status === 'approved')
      .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0)),
    [rawRequests]);

  const history = useMemo(() =>
    rawRequests.filter(r => r.status === 'played' || r.status === 'skipped')
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [rawRequests]);

  const nextQueuePos = useMemo(() =>
    queue.reduce((m, r) => Math.max(m, r.queuePosition ?? 0), 0) + 1,
    [queue]);

  const danceRequestCounts = useMemo(() => {
    const counts = {};
    for (const r of rawRequests.filter(r => ['pending', 'approved', 'playing'].includes(r.status))) {
      const key = (r.danceName || '').toLowerCase().trim();
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [rawRequests]);

  // Group pending by dance
  const danceGroups = useMemo(
    () => buildPendingGroups(pending, [...queue, ...playing], {}, buildPlaysPerClient(rawRequests)),
    [pending, queue, playing, rawRequests]
  );

  // Keep ref current so polling closure sees fresh requests
  useEffect(() => { allRequestsRef.current = rawRequests; }, [rawRequests]);

  // ── Queue the next track into Spotify 5s before the current one ends ─────
  async function queueNextTrack() {
    const allReqs = allRequestsRef.current;
    const nextUp = allReqs
      .filter(r => r.status === 'approved')
      .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))[0];
    if (!nextUp?.spotifyUri) return;
    if (queuedAheadRef.current === nextUp._id) return; // already queued this one
    try {
      await spotifyCmd('POST', { uri: nextUp.spotifyUri });
      queuedAheadRef.current = nextUp._id;
    } catch {}
  }

  // ── Spotify polling + track-change detection ──────────────────────────────
  useEffect(() => {
    if (!spotifyConnected) return;
    let cancelled = false;

    async function poll() {
      try {
        const data = await fetch('/api/spotify/player').then(r => r.json());
        if (cancelled) return;
        setSpotifyData(data);

        const currentUri = data?.playback?.item?.uri ?? null;
        const prevUri = lastTrackUriRef.current;

        // Detect a natural track change (Spotify moved to next track on its own)
        if (currentUri && prevUri && currentUri !== prevUri) {
          const allReqs = allRequestsRef.current;
          const wasPlaying = allReqs.find(r => r.status === 'playing' && r.spotifyUri === prevUri);
          if (wasPlaying) {
            await patchReq(wasPlaying._id, { status: 'played' });
            const nextUp = allReqs
              .filter(r => r.status === 'approved')
              .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))[0];
            if (nextUp) {
              await patchReq(nextUp._id, {
                status: 'playing',
                playStartedAt: new Date(Date.now() - (data.playback?.progress_ms ?? 0)).toISOString(),
                ...SpotifyAdapter.playingStamps(),
              });
            }
            // Reset ahead-queue tracking for the new track
            queuedAheadRef.current = null;
            if (aheadTimerRef.current) clearTimeout(aheadTimerRef.current);
            mutate();
          }
        }

        lastTrackUriRef.current = currentUri;

        // Schedule queuing the next track 5s before the current one ends
        if (data?.playback?.is_playing && data.playback.item) {
          const remaining = data.playback.item.duration_ms - data.playback.progress_ms;
          if (aheadTimerRef.current) clearTimeout(aheadTimerRef.current);
          if (remaining <= 5000) {
            await queueNextTrack();
          } else {
            aheadTimerRef.current = setTimeout(queueNextTrack, remaining - 5000);
          }
        }
      } catch {}
    }

    poll();
    const iv = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
      if (aheadTimerRef.current) clearTimeout(aheadTimerRef.current);
    };
  }, [spotifyConnected, mutate]);

  // ── Spotify controls ──────────────────────────────────────────────────────
  async function handleSpotifyControl(action) {
    try {
      if (action === 'previous') {
        // Always restart the current track — going to previous is not supported
        // from the controller (complex DB side effects, low DJ utility)
        await spotifyCmd('PUT', { action: 'seek', position_ms: 0 });
        const playingItem = rawRequests.find(r => r.status === 'playing');
        if (playingItem) {
          await patchReq(playingItem._id, { playStartedAt: new Date().toISOString() });
          mutate();
        }
      } else if (action === 'pause') {
        await spotifyCmd('PUT', { action: 'pause' });
        const playingItem = rawRequests.find(r => r.status === 'playing');
        if (playingItem) {
          await patchReq(playingItem._id, { pausedAt: new Date().toISOString() });
          mutate();
        }
      } else if (action === 'play') {
        await spotifyCmd('PUT', { action: 'play' });
        const playingItem = rawRequests.find(r => r.status === 'playing');
        if (playingItem?.pausedAt && playingItem?.playStartedAt) {
          const elapsed = new Date(playingItem.pausedAt) - new Date(playingItem.playStartedAt);
          await patchReq(playingItem._id, {
            playStartedAt: new Date(Date.now() - elapsed).toISOString(),
            pausedAt: null,
          });
          mutate();
        }
      } else if (action === 'next') {
        // Update DB first so the feed changes immediately, then tell Spotify to skip
        const playingItem = rawRequests.find(r => r.status === 'playing');
        if (playingItem) {
          await patchReq(playingItem._id, { status: 'played' });
          const nextUp = rawRequests
            .filter(r => r.status === 'approved')
            .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))[0];
          if (nextUp) {
            await patchReq(nextUp._id, { status: 'playing', playStartedAt: new Date().toISOString(), ...SpotifyAdapter.playingStamps() });
          }
          mutate();
        }
        await spotifyCmd('PUT', { action: 'next' });
        // Update lastTrackUriRef so the poll doesn't double-advance
        setTimeout(() => {
          fetch('/api/spotify/player').then(r => r.json()).then(d => {
            lastTrackUriRef.current = d?.playback?.item?.uri ?? null;
            setSpotifyData(d);
          }).catch(() => {});
        }, 800);
      } else {
        await spotifyCmd('PUT', { action });
      }
      setSpotifyError(null);
    } catch (err) {
      setSpotifyError(err.message);
    }
    setTimeout(() => fetch('/api/spotify/player').then(r => r.json()).then(setSpotifyData).catch(() => {}), 800);
  }

  // ── Queue actions ─────────────────────────────────────────────────────────
  async function approve(id) {
    // DB only — the ahead-queue timer handles when to add to Spotify
    await patchReq(id, { status: 'approved', queuePosition: nextQueuePos });
    mutate();
  }

  async function startQueue() {
    if (queue.length === 0) return;
    const first = queue[0];
    await patchReq(first._id, { status: 'playing', playStartedAt: new Date().toISOString(), ...SpotifyAdapter.playingStamps() });
    if (spotifyConnected && first.spotifyUri) {
      try {
        // Play only the first track. The ahead-queue timer handles everything
        // after that — queuing each next track 5s before it's needed.
        // This gives seamless playback with correct reorder support.
        await spotifyCmd('PUT', { action: 'play', uris: [first.spotifyUri] });
        await spotifyCmd('PUT', { action: 'repeat', state: 'off' });
        queuedAheadRef.current = null;
        setSpotifyError(null);
      } catch (err) {
        setSpotifyError(err.message);
      }
    }
    mutate();
  }

  async function markPlayed(id) {
    await patchReq(id, { status: 'played' });
    mutate();
  }

  async function skip(id) {
    await patchReq(id, { status: 'skipped' });
    mutate();
  }

  async function remove(id) {
    await deleteReq(id);
    mutate();
  }

  async function addFromSearch(track) {
    await fetch('/api/dj/requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        danceId: null, danceName: track.name, songName: track.name,
        artist: track.artists, duration_ms: track.duration_ms,
        spotifyUri: track.uri, clientId: 'dj', requesterName: 'DJ',
        notes: '', status: 'approved', queuePosition: nextQueuePos,
      }),
    });
    mutate();
  }

  // ── Drag-and-drop reorder ─────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = useCallback(async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = queue.findIndex(r => r._id === active.id);
    const newIdx = queue.findIndex(r => r._id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(queue, oldIdx, newIdx);
    // Optimistic update
    mutate(prev => {
      const pos = Object.fromEntries(reordered.map((r, i) => [r._id, i + 1]));
      return prev.map(r => r._id in pos ? { ...r, queuePosition: pos[r._id] } : r);
    }, false);
    await Promise.all(reordered.map((r, i) => patchReq(r._id, { queuePosition: i + 1 })));
    mutate();
    // The ahead-queue timer re-evaluates on the next poll with the new DB order.
    // Tracks already sent to Spotify's user queue remain locked (within last 5s of track).
  }, [queue, mutate]);

  // ── Session controls ──────────────────────────────────────────────────────
  async function closeSession() {
    if (!activeSession) return;
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    });
    if (spotifyConnected) {
      try { await spotifyCmd('PUT', { action: 'pause' }); } catch {}
    }
    mutateSessions(); mutate();
  }

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <span className={styles.appName}>🎛️ DJ + Spotify</span>
        <div className={styles.topBarNav}>
          {activeSession && (
            <div className={styles.topBarNavPrimary}>
              <button className={styles.topBarNavBtn} onClick={() => window.open(`/feed/${activeSession.slug}`, '_blank')}>Feed ↗</button>
              <button className={styles.topBarNavBtn} onClick={() => window.open(`/request/${activeSession.slug}`, '_blank')}>Requests ↗</button>
            </div>
          )}
          <div className={styles.topBarNavSecondary}>
            {spotifyConnected
              ? <span className={sp.spotifyChip}>● Spotify</span>
              : <a href="/api/spotify/auth" className={sp.spotifyChipOff}>Connect Spotify</a>}
            <Link href="/dj-controller" className={styles.topBarNavLink}>Standard</Link>
          </div>
          <div className={styles.sessionBarUser}>
            <button className={styles.topBarNavBtn} onClick={() => signOut({ callbackUrl: '/' })}>Sign out</button>
          </div>
        </div>
      </header>

      <div className={styles.layout}>
        {/* ── Queue column ── */}
        <section className={styles.column}>
          <div className={styles.colHead}>
            <span className={styles.colLabel}>Queue</span>
            <span className={styles.colCount}>{queue.length + playing.length}</span>
          </div>

          <div className={styles.sessionBar}>
            {activeSession ? (
              <>
                <span className={styles.sessionBarDot} />
                <span className={styles.sessionBarName}>{activeSession.name}</span>
                {activeSession.endsAt && (
                  <span className={styles.sessionBarEndsAt}>
                    ends {new Date(activeSession.endsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                )}
                <button className={styles.sessionBarBtn} onClick={closeSession}>End</button>
              </>
            ) : (
              <>
                <span className={styles.sessionBarNone}>No active session</span>
                <Link href="/start" className={styles.sessionBarBtnNew}>+ Start Session</Link>
              </>
            )}
          </div>

          <div className={styles.colBody}>
            <SpotifyPanel
              data={spotifyData}
              onControl={handleSpotifyControl}
              connected={spotifyConnected}
              error={spotifyError}
              onRetry={() => {
                setSpotifyError(null);
                fetch('/api/spotify/player').then(r => r.json()).then(setSpotifyData).catch(() => {});
              }}
            />

            {playing.length === 0 && queue.length > 0 && (
              <button className={styles.remoteBtnStart} onClick={startQueue}>▶ Start Queue</button>
            )}

            {playing.map(r => (
              <div key={r._id} className={styles.qCard} style={{ borderColor: 'rgba(138,92,255,0.4)' }}>
                <div className={styles.qInfo}>
                  <div className={styles.qName}>{r.danceName} <span className={styles.nowBadge}>NOW PLAYING</span></div>
                  {r.songName && <div className={styles.qSong}>{r.songName}{r.artist ? ` — ${r.artist}` : ''}</div>}
                </div>
                <div className={styles.qActions}>
                  <button className={styles.btnPlayed} onClick={() => markPlayed(r._id)}>✓ Played</button>
                  <button className={styles.btnRemove} onClick={() => remove(r._id)}>✕</button>
                </div>
              </div>
            ))}

            {queue.length === 0 && playing.length === 0 && (
              <p className={styles.empty}>Queue is empty.</p>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={queue.map(r => r._id)} strategy={verticalListSortingStrategy}>
                {queue.map(r => (
                  <SortableQueueCard key={r._id} request={r} onPlayed={markPlayed} onRemove={remove}
                    requesterCount={danceRequestCounts[(r.danceName || '').toLowerCase().trim()] ?? 1} />
                ))}
              </SortableContext>
            </DndContext>

            <SpotifySearch onAdd={addFromSearch} />

            {history.length > 0 && (
              <details className={styles.historyDetails}>
                <summary className={styles.historySummary}>
                  History ({history.length})
                </summary>
                {history.map(r => (
                  <div key={r._id} className={styles.histRow}>
                    <span className={r.status === 'played' ? styles.histDot : styles.histDotSkip} />
                    <span className={styles.histName}>{r.danceName}</span>
                    <span className={styles.histAge}>{timeAgo(r.updatedAt)} ago</span>
                  </div>
                ))}
              </details>
            )}
          </div>
        </section>

        {/* ── Pending column ── */}
        <section className={styles.column}>
          <div className={styles.colHead}>
            <span className={styles.colLabel}>Requests</span>
            <span className={styles.colCount}>{pending.length}</span>
          </div>
          <div className={styles.colBody}>
            {danceGroups.length === 0
              ? <p className={styles.empty}>No pending requests.</p>
              : danceGroups.map(group => {
                  const expanded = expandedDances.has(group.key);
                  return (
                    <div key={group.key} className={styles.danceGroup}>
                      <div className={styles.danceGroupRow}>
                        <div className={styles.danceGroupInfo}>
                          <span className={styles.danceGroupName}>
                            {group.stepsheet
                              ? <a href={group.stepsheet} target="_blank" rel="noopener noreferrer" className={styles.pNameLink}>{group.danceName}</a>
                              : group.danceName}
                            {group.spotifyUri && <span className={sp.spotifyDot}>♪</span>}
                          </span>
                          <div className={styles.danceGroupSub}>
                            {group.difficulty && <span className={styles.diffPip} style={{ background: diffColor(group.difficulty) }}>{group.difficulty}</span>}
                            {group.songName && <span className={styles.danceGroupSong}>{group.songName}</span>}
                          </div>
                        </div>
                        <div className={styles.danceGroupRight}>
                          <button className={styles.countBtn}
                            onClick={() => setExpandedDances(p => { const n = new Set(p); n.has(group.key) ? n.delete(group.key) : n.add(group.key); return n; })}>
                            {group.requests.length} {expanded ? '▲' : '▼'}
                          </button>
                          <button className={styles.btnApprove} onClick={() => approve(group.requests[0]._id)}>Queue →</button>
                          <button className={styles.btnDenyGroup}
                            onClick={() => Promise.all(group.requests.map(r => patchReq(r._id, { status: 'skipped' }))).then(mutate)}>
                            Deny
                          </button>
                        </div>
                      </div>
                      {expanded && (
                        <ul className={styles.danceExpanded}>
                          {group.requests.map(r => (
                            <li key={r._id} className={styles.danceExpandedRow}>
                              <span className={styles.expandedWho}>{r.requesterName || r.clientId || 'Anonymous'}</span>
                              <span className={styles.qAge}>{timeAgo(r.createdAt)}</span>
                              <button className={styles.btnSkipSm} onClick={() => skip(r._id)}>Skip</button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DJSpotifyPage() {
  const [spotifyConnected, setSpotifyConnected] = useState(false);

  useEffect(() => {
    fetch('/api/spotify/player')
      .then(r => r.json())
      .then(d => setSpotifyConnected(!!d.connected))
      .catch(() => {});
    const params = new URLSearchParams(window.location.search);
    if (params.get('spotify_connected')) {
      setSpotifyConnected(true);
      window.history.replaceState({}, '', '/dj-spotify');
    }
  }, []);

  return (
    <>
      <Head><title>DJ Spotify Controller</title></Head>
      <Controller spotifyConnected={spotifyConnected} />
    </>
  );
}
