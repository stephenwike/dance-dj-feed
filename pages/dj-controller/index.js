import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { URGENT_TEMPLATES, QUEUE_TEMPLATES, URGENT_DURATIONS, QUEUE_DURATIONS } from '../../lib/messages/templates';
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './dj-controller.module.css';
import { buildPendingGroups } from '../../lib/client/dj/pendingGroups';
import { buildPlaysPerClient } from '../../lib/client/dj/fairnessScore';
import { remainingMs } from '../../lib/client/dj/autoAdvance';
import { StandardAdapter, SpotifyAdapter } from '../../lib/client/dj/controllerAdapters';
import sp from '../dj-spotify/dj-spotify.module.css';

const fetcher = url => fetch(url).then(r => r.json());

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatTimestamp(date) {
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const DIFF_COLORS = {
  beginner: '#22c55e', improver: '#3b82f6',
  intermediate: '#f59e0b', advanced: '#ef4444',
};

function diffColor(d = '') {
  const key = Object.keys(DIFF_COLORS).find(k => d.toLowerCase().includes(k));
  return key ? DIFF_COLORS[key] : '#8A5CFF';
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

async function patch(id, body) {
  await fetch(`/api/dj/requests/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
async function del(id) {
  await fetch(`/api/dj/requests/${id}`, { method: 'DELETE' });
}

function fmtMs(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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

// ── Spotify Plugin Components ─────────────────────────────────────────────────
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
        {track?.album?.images?.[2] && <img className={sp.albumArt} src={track.album.images[2].url} alt="" />}
        <div className={sp.spotifyTrackInfo}>
          <span className={sp.spotifyTrackName}>{track?.name ?? 'Nothing playing'}</span>
          <span className={sp.spotifyTrackArtist}>{track?.artists?.map(a => a.name).join(', ') ?? ''}</span>
        </div>
        <span className={sp.spotifyDuration}>{track ? `${fmtMs(pb.progress_ms)} / ${fmtMs(track.duration_ms)}` : ''}</span>
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
  if (!open) return <button className={sp.searchToggle} onClick={() => setOpen(true)}>+ Add from Spotify</button>;
  return (
    <div className={sp.searchPanel}>
      <form onSubmit={search} className={sp.searchForm}>
        <input className={sp.searchInput} value={q} onChange={e => setQ(e.target.value)} placeholder="Search Spotify…" autoFocus />
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

// ── Sessions Panel ───────────────────────────────────────────────────────────
function SessionRow({ session, onContinue, onClose }) {
  const [expanded, setExpanded] = useState(false);
  const [played, setPlayed] = useState(null);

  async function toggle() {
    if (!expanded && played === null) {
      const data = await fetch(`/api/dj/sessions/${session._id}`).then(r => r.json());
      setPlayed(data.played ?? []);
    }
    setExpanded(v => !v);
  }

  const duration = session.closedAt
    ? formatDuration(new Date(session.closedAt) - new Date(session.startedAt))
    : 'ongoing';

  return (
    <div className={styles.sessionRow}>
      <div className={styles.sessionRowHead}>
        <div className={styles.sessionRowInfo}>
          <span className={styles.sessionRowName}>{session.name}</span>
          <span className={styles.sessionRowMeta}>
            {new Date(session.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' · '}{duration}
            {session.status === 'active' && <span className={styles.activePip}> · active</span>}
          </span>
        </div>
        <div className={styles.sessionRowActions}>
          {session.status === 'active' && (
            <button className={styles.btnCloseSession} onClick={() => onClose(session._id)}>
              Close
            </button>
          )}
          {session.status === 'closed' && (
            <button className={styles.btnContinue} onClick={() => onContinue(session._id)}>
              Continue
            </button>
          )}
          <button className={styles.btnExpand} onClick={toggle}>
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className={styles.sessionPlayed}>
          {played === null && <p className={styles.sessionLoading}>Loading…</p>}
          {played?.length === 0 && <p className={styles.sessionEmpty}>No tracks played.</p>}
          {played?.map((r, i) => (
            <div key={r._id} className={styles.sessionTrack}>
              <span className={styles.sessionTrackNum}>{i + 1}</span>
              <span className={styles.sessionTrackName}>{r.danceName}</span>
              <span className={styles.sessionTrackTime}>{formatTimestamp(r.updatedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SessionsPanel({ sessions, activeSession, onClose, onContinue, onCloseSession }) {
  return (
    <div className={styles.sessionsOverlay}>
      <div className={styles.sessionsPanel}>
        <div className={styles.sessionsPanelHead}>
          <span className={styles.sessionsPanelTitle}>Sessions</span>
          <button className={styles.btnClosePanel} onClick={onClose}>✕</button>
        </div>

        <Link href="/start" className={styles.btnNewSession} onClick={onClose}>
          + Start New Session
        </Link>

        <div className={styles.sessionsList}>
          {sessions.length === 0 && (
            <p className={styles.sessionEmpty}>No sessions yet.</p>
          )}
          {sessions.map(s => (
            <SessionRow key={s._id} session={s} onContinue={onContinue} onClose={onCloseSession} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Custom Edit Modal ─────────────────────────────────────────────────────────
function CustomEditModal({ group, onClose, onSave }) {
  const [editType, setEditType] = useState(
    group.requests[0]?.danceType || 'partner'
  );
  const [editStyle, setEditStyle] = useState(group.requests[0]?.partnerStyle || '');
  const [editName, setEditName] = useState(group.danceName);
  const [editDifficulty, setEditDifficulty] = useState(group.difficulty || '');
  const [lineMode, setLineMode] = useState('search');
  const [danceSearch, setDanceSearch] = useState('');
  const [dbDances, setDbDances] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [selectedDb, setSelectedDb] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDbLoading(true);
    fetch('/api/dj/dances').then(r => r.json()).then(data => {
      setDbDances(data);
      setDbLoading(false);
    });
  }, []);

  const filteredDb = useMemo(() => {
    if (!dbDances || !danceSearch.trim()) return [];
    const q = danceSearch.toLowerCase();
    return dbDances.filter(d =>
      d.danceName?.toLowerCase().includes(q) || d.songName?.toLowerCase().includes(q)
    ).slice(0, 7);
  }, [dbDances, danceSearch]);

  async function handleSave() {
    setSaving(true);
    const updates = {};
    if (selectedDb) {
      Object.assign(updates, {
        danceId: selectedDb.id,
        danceName: selectedDb.danceName,
        songName: selectedDb.songName || '',
        artist: selectedDb.artist || '',
        difficulty: selectedDb.difficulty || '',
        stepsheet: selectedDb.stepsheet || '',
        duration_ms: selectedDb.duration_ms ?? null,
        danceType: null,
      });
    } else {
      updates.danceType = editType;
      updates.danceName = editName.trim() || group.danceName;
      if (editType === 'partner') updates.partnerStyle = editStyle.trim();
      if (editType === 'line') updates.difficulty = editDifficulty;
    }
    await onSave(group.requests, updates);
    setSaving(false);
    onClose();
  }

  return (
    <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>Edit Request</span>
          <button className={styles.btnClosePanel} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          <p className={styles.modalSubtitle}>
            &ldquo;{group.danceName}&rdquo; &mdash; {group.requests.length} requester{group.requests.length !== 1 ? 's' : ''}
          </p>

          {/* Type toggle */}
          <label className={styles.modalLabel}>Dance type</label>
          <div className={styles.customTypeToggle}>
            <button className={`${styles.customTypeBtn} ${editType === 'partner' ? styles.customTypeBtnActive : ''}`}
              onClick={() => setEditType('partner')}>👫 Partner Dance</button>
            <button className={`${styles.customTypeBtn} ${editType === 'line' ? styles.customTypeBtnActive : ''}`}
              onClick={() => setEditType('line')}>💃 Line Dance</button>
          </div>

          {/* Partner dance — style + name */}
          {editType === 'partner' && (
            <>
              <label className={styles.modalLabel}>Dance style</label>
              <input
                className={styles.customEditInput}
                list="partner-styles"
                value={editStyle}
                onChange={e => setEditStyle(e.target.value)}
                placeholder="e.g. Waltz, 2 Step, West Coast Swing…"
                autoFocus
              />
              <datalist id="partner-styles">
                {PARTNER_STYLES.map(s => <option key={s} value={s} />)}
              </datalist>
              <label className={styles.modalLabel}>Description (optional)</label>
              <input className={styles.customEditInput} value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="e.g. that slow one they played last week" />
            </>
          )}

          {/* Line dance — search or manual */}
          {editType === 'line' && (
            <>
              <label className={styles.modalLabel}>Identify as</label>
              <div className={styles.customTypeToggle}>
                <button className={`${styles.customTypeBtn} ${lineMode === 'search' ? styles.customTypeBtnActive : ''}`}
                  onClick={() => setLineMode('search')}>Search database</button>
                <button className={`${styles.customTypeBtn} ${lineMode === 'manual' ? styles.customTypeBtnActive : ''}`}
                  onClick={() => setLineMode('manual')}>Edit manually</button>
              </div>

              {lineMode === 'search' && (
                <div className={styles.customSearchWrap}>
                  {selectedDb ? (
                    <div className={styles.customSelectedDb}>
                      <span style={{ flex: 1 }}>{selectedDb.danceName}</span>
                      {selectedDb.difficulty && (
                        <span className={styles.diffPip} style={{ background: diffColor(selectedDb.difficulty), fontSize: '0.65rem' }}>
                          {selectedDb.difficulty}
                        </span>
                      )}
                      <button className={styles.customCancelBtn}
                        onClick={() => { setSelectedDb(null); setDanceSearch(''); }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <input className={styles.customEditInput} value={danceSearch}
                        onChange={e => setDanceSearch(e.target.value)}
                        placeholder={dbLoading ? 'Loading…' : 'Search by name or song…'}
                        autoFocus />
                      {filteredDb.length > 0 && (
                        <ul className={styles.customDbResults}>
                          {filteredDb.map(d => (
                            <li key={d.id}>
                              <button className={styles.customDbResult}
                                onClick={() => { setSelectedDb(d); setDanceSearch(d.danceName); }}>
                                <span>{d.danceName}</span>
                                {d.songName && <span className={styles.modalDanceSong}>{d.songName}</span>}
                                {d.difficulty && (
                                  <span className={styles.diffPip} style={{ background: diffColor(d.difficulty), fontSize: '0.6rem' }}>
                                    {d.difficulty}
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}

              {lineMode === 'manual' && (
                <>
                  <label className={styles.modalLabel}>Dance name</label>
                  <input className={styles.customEditInput} value={editName}
                    onChange={e => setEditName(e.target.value)} placeholder="Dance name" autoFocus />
                  <label className={styles.modalLabel}>Difficulty</label>
                  <select className={styles.customEditSelect} value={editDifficulty}
                    onChange={e => setEditDifficulty(e.target.value)}>
                    <option value="">Select difficulty…</option>
                    {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </>
              )}
            </>
          )}
        </div>

        <div className={styles.modalFoot}>
          <button className={styles.customCancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.customSaveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Countdown timer (isolated so only this re-renders each second) ────────────
function CountdownTimer({ playStartedAt, duration_ms, className }) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    function update() {
      const elapsed = Date.now() - new Date(playStartedAt).getTime();
      setRemaining(Math.max(0, (duration_ms ?? 180000) - elapsed));
    }
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [playStartedAt, duration_ms]);

  if (remaining === null) return null;
  const s = Math.floor(remaining / 1000);
  return (
    <span className={className ?? styles.countdown}>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

// ── Remote Control ────────────────────────────────────────────────────────────
function RemoteControl({ playing, queue, onAction, activeSession }) {
  const track = playing[0] ?? null;
  const isPaused = !!(track?.pausedAt);

  if (!activeSession) return (
    <div className={styles.remote}>
      <p className={styles.remoteNoSession}>Open a session to start the queue.</p>
    </div>
  );
  if (!track && queue.length === 0) return null;

  return (
    <div className={styles.remote}>
      {track ? (
        <>
          <div className={styles.remoteTrackRow}>
            <div className={styles.remoteTrackInfo}>
              <span className={styles.remoteStatus}>{isPaused ? '⏸ Paused' : '▶ Now Playing'}</span>
              <span className={styles.remoteTrackName}>{track.danceName}</span>
            </div>
            {track.playStartedAt && !isPaused && (
              <CountdownTimer playStartedAt={track.playStartedAt} duration_ms={track.duration_ms} className={styles.remoteCountdown} />
            )}
          </div>
          <div className={styles.remoteButtons}>
            <button
              className={`${styles.remoteBtn} ${isPaused ? styles.remoteBtnResume : styles.remoteBtnPause}`}
              onClick={() => onAction(track._id, isPaused ? 'resume' : 'pause')}
            >
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button className={`${styles.remoteBtn} ${styles.remoteBtnSkip}`} onClick={() => onAction(track._id, 'advance')}>
              ⏭ Skip
            </button>
            <button className={`${styles.remoteBtn} ${styles.remoteBtnStop}`} onClick={() => onAction(track._id, 'remove')}>
              ✕ Stop
            </button>
          </div>
        </>
      ) : (
        <button className={styles.remoteBtnStart} onClick={() => onAction(queue[0]._id, 'startQueue')}>
          ▶ Start Queue
        </button>
      )}
    </div>
  );
}

// ── Queue Card (approved items only) ─────────────────────────────────────────
function QueueCard({ request, onAction, resolvedName, dragHandleProps, requesterCount }) {
  const { _id, danceName, songName, artist, difficulty, stepsheet, clientId, notes, createdAt, tipCents, danceType, duration_ms } = request;
  const isMessage = danceType === 'message';
  const displayName = resolvedName || clientId || '';
  const hasCustomName = displayName && displayName !== clientId;

  return (
    <div className={`${styles.qCard} ${isMessage ? styles.qCardMessage : ''}`}>
      <div className={styles.qGrip} {...dragHandleProps} title="Drag to reorder">
        <span aria-hidden>⠿</span>
      </div>
      <div className={styles.qInfo}>
        <div className={styles.qName}>
          {isMessage
            ? <><span className={styles.qMsgIcon}>💬</span>{danceName}</>
            : stepsheet
              ? <a href={stepsheet} target="_blank" rel="noopener noreferrer" className={styles.qNameLink}>{danceName}</a>
              : danceName}
        </div>
        {!isMessage && songName && <div className={styles.qSong}>{songName}{artist ? ` — ${artist}` : ''}</div>}
        <div className={styles.qMeta}>
          {isMessage ? (
            <span className={styles.qMsgDuration}>
              {duration_ms ? `${Math.round(duration_ms / 60000)} min` : 'Until skipped'}
            </span>
          ) : (
            <>
              {difficulty && (
                <span className={styles.diffPip} style={{ background: diffColor(difficulty) }}>{difficulty}</span>
              )}
              {requesterCount > 1
                ? <span className={styles.queueCountBadge}>{requesterCount}</span>
                : displayName && (
                  <span className={styles.qWho}>
                    {hasCustomName ? displayName : clientId}
                    {hasCustomName && clientId && <span className={styles.qClientId}>{clientId}</span>}
                  </span>
                )
              }
              {(tipCents ?? 0) > 0 && (
                <span className={styles.qBeatChip}>♫ {Math.round(tipCents / 5)}</span>
              )}
            </>
          )}
          <span className={styles.qAge}>{timeAgo(createdAt)}</span>
        </div>
        {!isMessage && notes && <div className={styles.qNote}>&ldquo;{notes}&rdquo;</div>}
      </div>
      <div className={styles.qActions}>
        <button className={styles.btnPlayed} onClick={() => onAction(_id, 'played')}>
          {isMessage ? '✓ Done' : '✓ Played'}
        </button>
        <button className={styles.btnRemove} onClick={() => onAction(_id, 'remove')}>✕</button>
      </div>
    </div>
  );
}

const DIFFICULTIES = ['Beginner', 'Beginner Hustle', 'Improver', 'Low Intermediate', 'Intermediate', 'Advanced'];
const PARTNER_STYLES = [
  '2 Step', '3 Step', 'Waltz', 'Viennese Waltz', 'Foxtrot', 'Quickstep',
  'Tango', 'Nightclub 2 Step', 'West Coast Swing', 'East Coast Swing',
  'Lindy Hop', 'Cha Cha', 'Salsa', 'Hustle', 'Polka', 'Rumba', 'Bachata',
];

// ── Pending Card ──────────────────────────────────────────────────────────────
function PendingCard({ request, onAction, resolvedName, repeatRequester }) {
  const { _id, danceName, songName, artist, difficulty, stepsheet, clientId, notes, createdAt, danceType } = request;
  const isCustom = !request.danceId;
  const displayName = resolvedName || clientId || '';
  const hasCustomName = displayName && displayName !== clientId;

  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState(danceType || 'partner');
  const [editName, setEditName] = useState(danceName);
  const [editDifficulty, setEditDifficulty] = useState(difficulty || '');
  const [lineMode, setLineMode] = useState('search'); // 'search' | 'manual'
  const [danceSearch, setDanceSearch] = useState('');
  const [dbDances, setDbDances] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [selectedDb, setSelectedDb] = useState(null);

  function openEdit() {
    setEditing(true);
    if (!dbDances) loadDances();
  }

  async function loadDances() {
    setDbLoading(true);
    const data = await fetch('/api/dj/dances').then(r => r.json());
    setDbDances(data);
    setDbLoading(false);
  }

  const filteredDb = useMemo(() => {
    if (!dbDances || !danceSearch.trim()) return [];
    const q = danceSearch.toLowerCase();
    return dbDances.filter(d =>
      d.danceName?.toLowerCase().includes(q) || d.songName?.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [dbDances, danceSearch]);

  async function saveEdit() {
    const updates = { danceType: editType };
    if (selectedDb) {
      Object.assign(updates, {
        danceId: selectedDb.id,
        danceName: selectedDb.danceName,
        songName: selectedDb.songName || '',
        artist: selectedDb.artist || '',
        difficulty: selectedDb.difficulty || '',
        stepsheet: selectedDb.stepsheet || '',
        duration_ms: selectedDb.duration_ms ?? null,
        danceType: null, // now a known dance, not custom
      });
    } else {
      updates.danceName = editName.trim() || danceName;
      if (editType === 'line') updates.difficulty = editDifficulty;
    }
    await fetch(`/api/dj/requests/${_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setEditing(false);
    onAction(_id, 'mutate');
  }

  function cancelEdit() {
    setEditName(danceName); setEditType(danceType || 'partner');
    setEditDifficulty(difficulty || ''); setDanceSearch('');
    setSelectedDb(null); setEditing(false);
  }

  return (
    <div className={`${styles.pCard} ${repeatRequester ? styles.pCardRepeat : ''}`}>
      <div className={styles.pInfo}>
        <div className={styles.pName}>
          {stepsheet
            ? <a href={stepsheet} target="_blank" rel="noopener noreferrer" className={styles.pNameLink}>{danceName}</a>
            : danceName}
          {repeatRequester && <span className={styles.repeatTag}>repeat</span>}
          {isCustom && !editing && (
            <span className={styles.customTypeBadge} data-type={editType}>
              {editType === 'line' ? 'Line Dance' : 'Partner Dance'}
            </span>
          )}
        </div>
        {songName && <div className={styles.pSong}>{songName}{artist ? ` — ${artist}` : ''}</div>}
        <div className={styles.pMeta}>
          {difficulty && (
            <span className={styles.diffPip} style={{ background: diffColor(difficulty) }}>{difficulty}</span>
          )}
          {displayName && (
            <span className={styles.pWho}>
              {hasCustomName ? displayName : clientId}
              {hasCustomName && clientId && <span className={styles.qClientId}>{clientId}</span>}
            </span>
          )}
          <span className={styles.qAge}>{timeAgo(createdAt)}</span>
        </div>
        {notes && <div className={styles.qNote}>&ldquo;{notes}&rdquo;</div>}

        {/* ── Inline edit for custom requests ── */}
        {isCustom && editing && (
          <div className={styles.customEdit}>
            {/* Type toggle */}
            <div className={styles.customTypeToggle}>
              <button className={`${styles.customTypeBtn} ${editType === 'partner' ? styles.customTypeBtnActive : ''}`}
                onClick={() => setEditType('partner')}>👫 Partner Dance</button>
              <button className={`${styles.customTypeBtn} ${editType === 'line' ? styles.customTypeBtnActive : ''}`}
                onClick={() => setEditType('line')}>💃 Line Dance</button>
            </div>

            {/* Partner dance: just name */}
            {editType === 'partner' && (
              <input className={styles.customEditInput} value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Dance / song description (optional)"
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                autoFocus />
            )}

            {/* Line dance: search or manual */}
            {editType === 'line' && (
              <>
                <div className={styles.customTypeToggle} style={{ marginTop: 0 }}>
                  <button className={`${styles.customTypeBtn} ${lineMode === 'search' ? styles.customTypeBtnActive : ''}`}
                    onClick={() => setLineMode('search')}>Search database</button>
                  <button className={`${styles.customTypeBtn} ${lineMode === 'manual' ? styles.customTypeBtnActive : ''}`}
                    onClick={() => setLineMode('manual')}>Edit manually</button>
                </div>

                {lineMode === 'search' && (
                  <div className={styles.customSearchWrap}>
                    <input className={styles.customEditInput} value={danceSearch}
                      onChange={e => setDanceSearch(e.target.value)}
                      placeholder={dbLoading ? 'Loading dances…' : 'Search by name or song…'}
                      autoFocus />
                    {selectedDb ? (
                      <div className={styles.customSelectedDb}>
                        <span>{selectedDb.danceName}</span>
                        {selectedDb.difficulty && <span className={styles.diffPip} style={{ background: diffColor(selectedDb.difficulty) }}>{selectedDb.difficulty}</span>}
                        <button className={styles.customCancelBtn} onClick={() => { setSelectedDb(null); setDanceSearch(''); }}>✕</button>
                      </div>
                    ) : filteredDb.length > 0 && (
                      <ul className={styles.customDbResults}>
                        {filteredDb.map(d => (
                          <li key={d.id}>
                            <button className={styles.customDbResult} onClick={() => { setSelectedDb(d); setDanceSearch(d.danceName); }}>
                              <span>{d.danceName}</span>
                              {d.difficulty && <span className={styles.diffPip} style={{ background: diffColor(d.difficulty), fontSize: '0.6rem' }}>{d.difficulty}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {lineMode === 'manual' && (
                  <>
                    <input className={styles.customEditInput} value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Dance name" autoFocus />
                    <select className={styles.customEditSelect} value={editDifficulty}
                      onChange={e => setEditDifficulty(e.target.value)}>
                      <option value="">Select difficulty…</option>
                      {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </>
                )}
              </>
            )}

            <div className={styles.customEditActions}>
              <button className={styles.customSaveBtn} onClick={saveEdit}>Save</button>
              <button className={styles.customCancelBtn} onClick={cancelEdit}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      <div className={styles.pActions}>
        {isCustom && !editing && (
          <button className={styles.btnEdit} onClick={openEdit} title="Edit">✎</button>
        )}
        <button className={styles.btnApprove} onClick={() => onAction(_id, 'approve')}>Queue →</button>
        <button className={styles.btnSkip} onClick={() => onAction(_id, 'skip')}>Skip</button>
      </div>
    </div>
  );
}

// ── Sortable wrapper ──────────────────────────────────────────────────────────
function SortableQueueItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 10 : 'auto' }} {...attributes}>
      {children(listeners)}
    </div>
  );
}

// ── Main Controller ───────────────────────────────────────────────────────────
function Controller() {
  const router = useRouter();
  const [pendingTab, setPendingTab] = useState('dances');
  const [expandedDances, setExpandedDances] = useState(new Set());
  const [expandedRequesters, setExpandedRequesters] = useState(new Set());
  const [showSessions, setShowSessions] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [showMessagePanel, setShowMessagePanel] = useState(false);
  const [msgTab, setMsgTab] = useState('urgent'); // 'urgent' | 'queue'
  const [msgText, setMsgText] = useState('');
  const [msgDuration, setMsgDuration] = useState(180);
  const [showHamburger, setShowHamburger] = useState(false);
  const hamburgerRef = useRef(null);

  // ── Spotify plugin state (unused when plugin !== 'spotify') ──
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyData, setSpotifyData] = useState(null);
  const [spotifyError, setSpotifyError] = useState(null);
  const allRequestsRef = useRef([]);
  const lastTrackUriRef = useRef(null);
  const queuedAheadRef = useRef(null);
  const aheadTimerRef = useRef(null);

  async function saveGroupEdit(requests, updates) {
    await Promise.all(requests.map(r =>
      fetch(`/api/dj/requests/${r._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
    ));
    mutate();
  }

  const { data: sessions = [], mutate: mutateSessions } = useSWR('/api/dj/sessions', fetcher, {
    refreshInterval: 30000, revalidateOnFocus: true,
  });
  const activeSession = sessions.find(s => s.status === 'active') ?? null;
  const isSpotify = activeSession?.plugin === 'spotify';

  const { data: msgData, mutate: mutateMsg } = useSWR(
    activeSession ? `/api/dj/messages?sessionId=${activeSession._id}` : null,
    fetcher, { refreshInterval: 15000 }
  );
  const activeMsg = (() => {
    const m = msgData?.message;
    if (!m) return null;
    if (m.expiresAt && new Date(m.expiresAt) <= new Date()) return null;
    return m;
  })();

  async function postMessage() {
    if (!msgText.trim()) return;
    await fetch('/api/dj/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: msgText.trim(), duration: msgDuration }),
    });
    setMsgText('');
    mutateMsg();
  }

  async function clearMessage() {
    if (!activeMsg) return;
    await fetch(`/api/dj/messages/${activeMsg._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    });
    mutateMsg();
  }

  async function addQueueMessage() {
    if (!msgText.trim() || !activeSession) return;
    await fetch('/api/dj/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        danceName: msgText.trim(),
        danceType: 'message',
        duration_ms: msgDuration ? msgDuration * 1000 : null,
        status: 'approved',
        sessionId: String(activeSession._id),
      }),
    });
    setMsgText('');
    setShowMessagePanel(false);
    mutate();
  }

  const { data: rawRequests = [], mutate } = useSWR('/api/dj/requests', fetcher, {
    refreshInterval: 5000, revalidateOnFocus: true, dedupingInterval: 2000,
  });

  const { data: stripeStatus } = useSWR('/api/dev/stripe-status', fetcher, {
    refreshInterval: 10000, shouldRetryOnError: false,
  });
  const stripeWarning = stripeStatus && !stripeStatus.active;

  function openNewSession() {
    router.push('/start');
  }

  async function closeSession() {
    if (!activeSession) return;
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    });
    if (isSpotify && spotifyConnected) {
      try { await spotifyCmd('PUT', { action: 'pause' }); } catch {}
    }
    mutateSessions();
    mutate();
  }

  async function togglePartnerDances() {
    if (!activeSession) return;
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partnerDancesEnabled: !activeSession.partnerDancesEnabled }),
    });
    mutateSessions();
  }

  async function toggleTipping() {
    if (!activeSession) return;
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tippingEnabled: activeSession.tippingEnabled === false }),
    });
    mutateSessions();
  }

  const tippingEnabled = activeSession?.tippingEnabled !== false;
  const partnerDancesEnabled = activeSession?.partnerDancesEnabled !== false;

  useEffect(() => {
    if (!showHamburger) return;
    function handleClickOutside(e) {
      if (hamburgerRef.current && !hamburgerRef.current.contains(e.target)) {
        setShowHamburger(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHamburger]);

  // ── Spotify: keep ref current so polling closure sees fresh requests ────────
  useEffect(() => { allRequestsRef.current = rawRequests; }, [rawRequests]);

  // ── Spotify: check connection when plugin is spotify ────────────────────────
  useEffect(() => {
    if (!isSpotify) return;
    fetch('/api/spotify/player')
      .then(r => r.json())
      .then(d => setSpotifyConnected(!!d.connected))
      .catch(() => {});
    const params = new URLSearchParams(window.location.search);
    if (params.get('spotify_connected')) {
      setSpotifyConnected(true);
      window.history.replaceState({}, '', '/dj-controller');
    }
  }, [isSpotify]);

  // ── Spotify: polling loop + track-change detection ──────────────────────────
  useEffect(() => {
    if (!isSpotify || !spotifyConnected) return;
    let cancelled = false;

    async function queueNextTrack() {
      const allReqs = allRequestsRef.current;
      const nextUp = allReqs
        .filter(r => r.status === 'approved')
        .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))[0];
      if (!nextUp?.spotifyUri) return;
      if (queuedAheadRef.current === nextUp._id) return;
      try {
        await spotifyCmd('POST', { uri: nextUp.spotifyUri });
        queuedAheadRef.current = nextUp._id;
      } catch {}
    }

    async function poll() {
      try {
        const data = await fetch('/api/spotify/player').then(r => r.json());
        if (cancelled) return;
        setSpotifyData(data);
        const currentUri = data?.playback?.item?.uri ?? null;
        const prevUri = lastTrackUriRef.current;
        if (currentUri && prevUri && currentUri !== prevUri) {
          const allReqs = allRequestsRef.current;
          const wasPlaying = allReqs.find(r => r.status === 'playing' && r.spotifyUri === prevUri);
          if (wasPlaying) {
            await patch(wasPlaying._id, { status: 'played' });
            const nextUp = allReqs
              .filter(r => r.status === 'approved')
              .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))[0];
            if (nextUp) {
              await patch(nextUp._id, {
                status: 'playing',
                playStartedAt: new Date(Date.now() - (data.playback?.progress_ms ?? 0)).toISOString(),
                ...SpotifyAdapter.playingStamps(),
              });
            }
            queuedAheadRef.current = null;
            if (aheadTimerRef.current) clearTimeout(aheadTimerRef.current);
            mutate();
          }
        }
        lastTrackUriRef.current = currentUri;
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
  }, [isSpotify, spotifyConnected, mutate]);

  // ── Spotify: player controls ─────────────────────────────────────────────────
  async function handleSpotifyControl(action) {
    try {
      if (action === 'previous') {
        await spotifyCmd('PUT', { action: 'seek', position_ms: 0 });
        const playingItem = rawRequests.find(r => r.status === 'playing');
        if (playingItem) { await patch(playingItem._id, { playStartedAt: new Date().toISOString() }); mutate(); }
      } else if (action === 'pause') {
        await spotifyCmd('PUT', { action: 'pause' });
        const playingItem = rawRequests.find(r => r.status === 'playing');
        if (playingItem) { await patch(playingItem._id, { pausedAt: new Date().toISOString() }); mutate(); }
      } else if (action === 'play') {
        await spotifyCmd('PUT', { action: 'play' });
        const playingItem = rawRequests.find(r => r.status === 'playing');
        if (playingItem?.pausedAt && playingItem?.playStartedAt) {
          const elapsed = new Date(playingItem.pausedAt) - new Date(playingItem.playStartedAt);
          await patch(playingItem._id, { playStartedAt: new Date(Date.now() - elapsed).toISOString(), pausedAt: null });
          mutate();
        }
      } else if (action === 'next') {
        const playingItem = rawRequests.find(r => r.status === 'playing');
        if (playingItem) {
          await patch(playingItem._id, { status: 'played' });
          const nextUp = rawRequests
            .filter(r => r.status === 'approved')
            .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))[0];
          if (nextUp) await patch(nextUp._id, { status: 'playing', playStartedAt: new Date().toISOString(), ...SpotifyAdapter.playingStamps() });
          mutate();
        }
        await spotifyCmd('PUT', { action: 'next' });
        setTimeout(() => fetch('/api/spotify/player').then(r => r.json()).then(d => {
          lastTrackUriRef.current = d?.playback?.item?.uri ?? null;
          setSpotifyData(d);
        }).catch(() => {}), 800);
      }
      setSpotifyError(null);
    } catch (err) {
      setSpotifyError(err.message);
    }
    setTimeout(() => fetch('/api/spotify/player').then(r => r.json()).then(setSpotifyData).catch(() => {}), 800);
  }

  async function addFromSpotify(track) {
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

  async function continueSession(id) {
    await fetch(`/api/dj/sessions/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    mutateSessions();
    mutate();
    setShowSessions(false);
  }

  const pending = useMemo(() =>
    rawRequests.filter(r => r.status === 'pending').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [rawRequests]);

  const playing = useMemo(() =>
    rawRequests.filter(r => r.status === 'playing'), [rawRequests]);

  // Auto-advance when the track timer expires — mirrors the dj-feed timer so
  // the queue advances even when the feed is not open in a browser tab.
  // Spotify plugin owns its own advancement via polling; skip for that case.
  const playingItem = playing[0] ?? null;
  useEffect(() => {
    if (isSpotify) return;
    if (!StandardAdapter.shouldAutoAdvance(playingItem)) return;
    const id = playingItem._id;
    const ms = remainingMs(playingItem);

    async function advance() {
      // Fresh fetch for idempotency — dj-feed may have already advanced
      const snap = await fetch('/api/dj/requests').then(r => r.json()).catch(() => []);
      const still = snap.find(r => r._id === id && r.status === 'playing');
      if (!still) return;
      await fetch(`/api/dj/requests/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'played' }),
      });
      const nextUp = snap
        .filter(r => r.status === 'approved')
        .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))[0];
      if (nextUp) {
        await fetch(`/api/dj/requests/${nextUp._id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'playing', playStartedAt: new Date().toISOString(), ...StandardAdapter.playingStamps() }),
        });
      }
      mutate();
    }

    if (ms === 0) { advance(); return; }
    const t = setTimeout(advance, ms);
    return () => clearTimeout(t);
  }, [isSpotify, playingItem?._id, playingItem?.playStartedAt, playingItem?.duration_ms,
      playingItem?.spotifyUri, playingItem?.pausedAt, mutate]);

  const queue = useMemo(() =>
    rawRequests.filter(r => r.status === 'approved').sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0)),
    [rawRequests]);

  const history = useMemo(() =>
    rawRequests.filter(r => r.status === 'played' || r.status === 'skipped').sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [rawRequests]);

  const repeatClientIds = useMemo(() => {
    const counts = {};
    for (const r of pending) if (r.clientId) counts[r.clientId] = (counts[r.clientId] ?? 0) + 1;
    return new Set(Object.keys(counts).filter(id => counts[id] > 1));
  }, [pending]);

  const resolvedNames = useMemo(() => {
    const map = {};
    for (const r of [...rawRequests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))) {
      if (!r.clientId || map[r.clientId]) continue;
      const custom = r.requesterName && r.requesterName !== r.clientId;
      map[r.clientId] = custom ? r.requesterName : r.clientId;
    }
    return map;
  }, [rawRequests]);

  // Most recent played time per dance (for REPEAT count)
  const lastPlayedAt = useMemo(() => {
    const map = {};
    for (const r of rawRequests.filter(r => r.status === 'played')) {
      const key = r.danceId || r.danceName;
      if (!map[key] || new Date(r.updatedAt) > new Date(map[key])) map[key] = r.updatedAt;
    }
    return map;
  }, [rawRequests]);

  // Total active requests per dance key (pending + approved + playing)
  const danceRequestCounts = useMemo(() => {
    const counts = {};
    for (const r of rawRequests.filter(r => ['pending', 'approved', 'playing'].includes(r.status))) {
      const key = r.danceId || r.danceName;
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [rawRequests]);

  const DECAY_PRESETS = [
    { label: 'Decay Off', enabled: false, minutes: 60 },
    { label: '30m decay', enabled: true,  minutes: 30 },
    { label: '1h decay',  enabled: true,  minutes: 60 },
    { label: '2h decay',  enabled: true,  minutes: 120 },
  ];

  const decayEnabled = activeSession?.weightDecayEnabled ?? false;
  const halfLifeMinutes = activeSession?.weightDecayHalfLifeMinutes ?? 60;

  async function cycleDecay() {
    if (!activeSession) return;
    const currentIdx = DECAY_PRESETS.findIndex(p =>
      p.enabled === decayEnabled && (!p.enabled || p.minutes === halfLifeMinutes)
    );
    const next = DECAY_PRESETS[(currentIdx + 1) % DECAY_PRESETS.length];
    await fetch(`/api/dj/sessions/${activeSession._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weightDecayEnabled: next.enabled, weightDecayHalfLifeMinutes: next.minutes }),
    });
    mutateSessions();
  }

  const currentDecayLabel = DECAY_PRESETS.find(p =>
    p.enabled === decayEnabled && (!p.enabled || p.minutes === halfLifeMinutes)
  )?.label ?? 'Decay Off';

  const playsPerClient = useMemo(
    () => buildPlaysPerClient(rawRequests, { decayEnabled, halfLifeMinutes }),
    [rawRequests, decayEnabled, halfLifeMinutes]
  );

  const danceGroups = useMemo(
    () => buildPendingGroups(pending, [...queue, ...playing], lastPlayedAt, playsPerClient),
    [pending, queue, playing, lastPlayedAt, playsPerClient]
  );

  const requesterGroups = useMemo(() => {
    const map = {};
    for (const r of rawRequests) {
      const key = r.clientId || r.requesterName || 'anon';
      if (!map[key]) map[key] = { key, clientId: r.clientId, displayName: resolvedNames[r.clientId] || r.requesterName || r.clientId || 'Anonymous', requests: [] };
      map[key].requests.push(r);
    }
    return Object.values(map).map(g => ({
      ...g,
      requests: [...g.requests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      submitted: g.requests.length,
      fulfilled: g.requests.filter(r => r.status === 'played').length,
    })).sort((a, b) => b.submitted - a.submitted);
  }, [rawRequests, resolvedNames]);

  function toggleDance(key) {
    setExpandedDances(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleRequester(key) {
    setExpandedRequesters(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const nextQueuePos = useMemo(() => queue.reduce((m, r) => Math.max(m, r.queuePosition ?? 0), 0) + 1, [queue]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = useCallback(async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = queue.findIndex(r => r._id === active.id);
    const newIdx = queue.findIndex(r => r._id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(queue, oldIdx, newIdx);
    mutate(prev => {
      const pos = Object.fromEntries(reordered.map((r, i) => [r._id, i + 1]));
      return prev.map(r => r._id in pos ? { ...r, queuePosition: pos[r._id] } : r);
    }, false);
    await Promise.all(reordered.map((r, i) => patch(r._id, { queuePosition: i + 1 })));
    mutate();
  }, [queue, mutate]);

  const handleAction = useCallback(async (id, action, extra) => {
    if (action === 'mutate') {
      // no-op — just triggers mutate() below
    } else if (action === 'denyGroup') {
      // extra = array of all requests in the group
      await Promise.all((extra ?? []).map(r => patch(r._id, { status: 'skipped' })));
    } else if (action === 'approve') {
      await patch(id, { status: 'approved', queuePosition: nextQueuePos });
    } else if (action === 'skip') {
      await patch(id, { status: 'skipped' });
    } else if (action === 'played') {
      await patch(id, { status: 'played' });
    } else if (action === 'remove') {
      await del(id);
    } else if (action === 'startQueue') {
      const stamps = isSpotify ? SpotifyAdapter.playingStamps() : StandardAdapter.playingStamps();
      await patch(id, { status: 'playing', playStartedAt: new Date().toISOString(), ...stamps });
      if (isSpotify && spotifyConnected) {
        const item = rawRequests.find(r => r._id === id);
        if (item?.spotifyUri) {
          try {
            await spotifyCmd('PUT', { action: 'play', uris: [item.spotifyUri] });
            await spotifyCmd('PUT', { action: 'repeat', state: 'off' });
            queuedAheadRef.current = null;
            setSpotifyError(null);
          } catch (err) {
            setSpotifyError(err.message);
          }
        }
      }
    } else if (action === 'pause') {
      await patch(id, { pausedAt: new Date().toISOString() });
    } else if (action === 'resume') {
      const r = rawRequests.find(r => r._id === id);
      if (r?.pausedAt && r?.playStartedAt) {
        const elapsed = new Date(r.pausedAt) - new Date(r.playStartedAt);
        await patch(id, { playStartedAt: new Date(Date.now() - elapsed).toISOString(), pausedAt: null });
      }
    } else if (action === 'advance') {
      await patch(id, { status: 'played' });
      if (queue[0]) {
        await patch(queue[0]._id, { status: 'playing', playStartedAt: new Date().toISOString(), ...StandardAdapter.playingStamps() });
      }
    }
    mutate();
  }, [nextQueuePos, queue, rawRequests, mutate, isSpotify, spotifyConnected]);

  async function clearHistory() {
    await Promise.all(history.map(r => del(r._id)));
    mutate();
  }

  return (
    <>
    {showSessions && (
      <SessionsPanel
        sessions={sessions}
        activeSession={activeSession}
        onClose={() => setShowSessions(false)}
        onContinue={continueSession}
        onCloseSession={async (id) => { await closeSession(); setShowSessions(false); }}
      />
    )}
    {editingGroup && (
      <CustomEditModal
        group={editingGroup}
        onClose={() => setEditingGroup(null)}
        onSave={saveGroupEdit}
      />
    )}
    <div className={styles.page}>
      {stripeWarning && (
        <div className={styles.stripeBanner}>
          ⚡ Stripe listener not running — payments won&apos;t confirm. Run <code>npm run stripe</code> in a separate terminal.
        </div>
      )}
      {/* ── Top bar ── */}
      <header className={styles.topBar}>
        {/* App name — full on wide screens, icon-only on narrow */}
        <span className={styles.appName}>
          <span className={styles.appNameFull}>🎛️ DJ Controller</span>
          <span className={styles.appNameShort}>🎛️</span>
        </span>

        {/* Session identity — always visible, truncates when tight */}
        <div className={styles.topBarSession}>
          {activeSession ? (
            <>
              <span className={styles.sessionBarDot} />
              <span className={styles.topBarSessionName}>{activeSession.name}</span>
              {activeSession.endsAt && (
                <span className={styles.topBarEndsAt}>
                  ends {new Date(activeSession.endsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
              <button className={styles.topBarEndBtn} onClick={closeSession}>End</button>
            </>
          ) : (
            <>
              <span className={styles.topBarNoSession}>No active session</span>
              <Link href="/start" className={styles.topBarNewBtn}>+ Start Session</Link>
            </>
          )}
        </div>

        <div className={styles.topBarNav}>
          {/* Primary nav — Feed + Requests (hidden below 900px) */}
          {activeSession && (
            <div className={styles.topBarNavPrimary}>
              <button className={styles.topBarNavBtn} onClick={() => window.open(`/feed/${activeSession.slug}`, '_blank')}>Feed ↗</button>
              <button className={styles.topBarNavBtn} onClick={() => window.open(`/request/${activeSession.slug}`, '_blank')}>Requests ↗</button>
            </div>
          )}
          {/* Secondary nav — History + Wallet (hidden below 1100px) */}
          <div className={styles.topBarNavSecondary}>
            {isSpotify && (
              spotifyConnected
                ? <span className={sp.spotifyChip}>● Spotify</span>
                : <a href="/api/spotify/auth" className={sp.spotifyChipOff}>Connect Spotify</a>
            )}
            <button className={styles.topBarNavBtn} onClick={() => setShowSessions(true)}>History</button>
            {process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true' && (
              <Link href="/dj-profile" className={styles.topBarNavLink}>Wallet</Link>
            )}
          </div>
          {/* Hamburger — appears when items are hidden (below 1100px) */}
          <div className={styles.hamburgerWrap} ref={hamburgerRef}>
            <button
              className={styles.hamburgerBtn}
              onClick={() => setShowHamburger(v => !v)}
              aria-label="More options"
            >
              ☰
            </button>
            {showHamburger && (
              <div className={styles.hamburgerMenu}>
                {activeSession && (
                  <>
                    <button className={styles.hamburgerItem} onClick={() => { window.open(`/feed/${activeSession.slug}`, '_blank'); setShowHamburger(false); }}>Feed ↗</button>
                    <button className={styles.hamburgerItem} onClick={() => { window.open(`/request/${activeSession.slug}`, '_blank'); setShowHamburger(false); }}>Requests ↗</button>
                    <div className={styles.hamburgerDivider} />
                  </>
                )}
                <button className={styles.hamburgerItem} onClick={() => { setShowSessions(true); setShowHamburger(false); }}>History</button>
                {process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true' && (
                  <Link className={styles.hamburgerItem} href="/dj-profile" onClick={() => setShowHamburger(false)}>Wallet</Link>
                )}
                {isSpotify && !spotifyConnected && (
                  <><div className={styles.hamburgerDivider} />
                  <a className={styles.hamburgerItem} href="/api/spotify/auth" onClick={() => setShowHamburger(false)}>Connect Spotify</a></>
                )}
              </div>
            )}
          </div>
          <div className={styles.sessionBarUser}><UserButton /></div>
        </div>
      </header>

      {/* ── Control strip ── */}
      {activeSession && (
        <div className={styles.controlStrip}>
          {/* Settings section — always kept together */}
          <div className={styles.controlSection}>
            <span className={styles.controlSectionLabel}>Settings</span>
            <button
              className={`${styles.controlToggle} ${partnerDancesEnabled ? styles.controlToggleOn : ''}`}
              onClick={togglePartnerDances}
            >
              👫 Partners {partnerDancesEnabled ? 'On' : 'Off'}
            </button>
            <button
              className={`${styles.controlToggle} ${tippingEnabled ? styles.controlToggleOn : ''}`}
              onClick={toggleTipping}
            >
              💰 Tipping {tippingEnabled ? 'On' : 'Off'}
            </button>
            <button
              className={`${styles.controlToggle} ${decayEnabled ? styles.controlToggleOn : ''}`}
              onClick={cycleDecay}
            >
              ⏱ {currentDecayLabel}
            </button>
          </div>

          <span className={styles.controlDivider} />

          {/* Messages section — always kept together */}
          <div className={styles.controlSection}>
            <span className={styles.controlSectionLabel}>Messages</span>
            {activeMsg && (
              <div className={styles.activeMsgChip}>
                <span className={styles.activeMsgText}>{activeMsg.text}</span>
                <button className={styles.activeMsgClear} onClick={clearMessage}>×</button>
              </div>
            )}
            <button
              className={`${styles.controlToggle} ${showMessagePanel && msgTab === 'urgent' ? styles.controlToggleMsgOn : ''}`}
              onClick={() => {
                if (showMessagePanel && msgTab === 'urgent') { setShowMessagePanel(false); }
                else { setMsgTab('urgent'); setShowMessagePanel(true); setMsgText(''); setMsgDuration(180); }
              }}
            >
              📢 Urgent
            </button>
            <button
              className={`${styles.controlToggle} ${showMessagePanel && msgTab === 'queue' ? styles.controlToggleMsgOn : ''}`}
              onClick={() => {
                if (showMessagePanel && msgTab === 'queue') { setShowMessagePanel(false); }
                else { setMsgTab('queue'); setShowMessagePanel(true); setMsgText(''); setMsgDuration(180); }
              }}
            >
              💬 In-queue
            </button>
          </div>
        </div>
      )}

      {/* ── Message input panel (expands below control strip) ── */}
      {showMessagePanel && activeSession && (
        <div className={styles.msgPanel}>
          {msgTab === 'urgent' && activeMsg && (
            <div className={styles.msgActive}>
              <span className={styles.msgActiveText}>{activeMsg.text}</span>
              <button className={styles.msgClearBtn} onClick={clearMessage}>Clear</button>
            </div>
          )}
          <div className={styles.msgTemplates}>
            {(msgTab === 'urgent' ? URGENT_TEMPLATES : QUEUE_TEMPLATES).map(t => (
              <button
                key={t}
                className={`${styles.msgTemplate} ${msgText === t ? styles.msgTemplateActive : ''}`}
                onClick={() => setMsgText(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <textarea
            className={styles.msgInput}
            placeholder={msgTab === 'urgent' ? 'Or type a custom urgent message…' : 'Or type a custom announcement…'}
            value={msgText}
            onChange={e => setMsgText(e.target.value)}
            rows={2}
            maxLength={120}
          />
          <div className={styles.msgFooter}>
            <div className={styles.msgDurations}>
              {(msgTab === 'urgent' ? URGENT_DURATIONS : QUEUE_DURATIONS).map(d => (
                <button
                  key={d.label}
                  className={`${styles.msgDuration} ${msgDuration === d.seconds ? styles.msgDurationActive : ''}`}
                  onClick={() => setMsgDuration(d.seconds)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <button
              className={styles.msgPostBtn}
              onClick={msgTab === 'urgent' ? postMessage : addQueueMessage}
              disabled={!msgText.trim()}
            >
              {msgTab === 'urgent' ? 'Post' : 'Add to Queue'}
            </button>
          </div>
        </div>
      )}

      <div className={styles.layout}>
        {/* ── Queue column ── */}
        <section className={styles.column}>
          <div className={styles.colHead}>
            <span className={styles.colLabel}>Queue</span>
            <span className={styles.colCount}>{queue.length}</span>
          </div>

          <div className={styles.colBody}>
            {isSpotify ? (
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
            ) : (
              <RemoteControl playing={playing} queue={queue} onAction={handleAction} activeSession={activeSession} />
            )}

            {isSpotify && playing.length === 0 && queue.length > 0 && (
              <button className={styles.remoteBtnStart} onClick={() => handleAction(queue[0]._id, 'startQueue')}>
                ▶ Start Queue
              </button>
            )}

            {isSpotify && playing.map(r => (
              <div key={r._id} className={styles.qCard} style={{ borderColor: 'rgba(138,92,255,0.4)' }}>
                <div className={styles.qInfo}>
                  <div className={styles.qName}>{r.danceName} <span className={styles.nowBadge}>NOW PLAYING</span></div>
                  {r.songName && <div className={styles.qSong}>{r.songName}{r.artist ? ` — ${r.artist}` : ''}</div>}
                </div>
                <div className={styles.qActions}>
                  <button className={styles.btnPlayed} onClick={() => handleAction(r._id, 'played')}>✓ Played</button>
                  <button className={styles.btnRemove} onClick={() => handleAction(r._id, 'remove')}>✕</button>
                </div>
              </div>
            ))}

            {!isSpotify && playing.length === 0 && queue.length === 0 && (
              <p className={styles.empty}>Queue is empty. Approve requests to add dances.</p>
            )}
            {isSpotify && playing.length === 0 && queue.length === 0 && (
              <p className={styles.empty}>Queue is empty.</p>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={queue.map(r => r._id)} strategy={verticalListSortingStrategy}>
                {queue.map(r => (
                  <SortableQueueItem key={r._id} id={r._id}>
                    {(dragHandleProps) => (
                      <QueueCard
                        request={r}
                        onAction={handleAction}
                        resolvedName={resolvedNames[r.clientId]}
                        dragHandleProps={dragHandleProps}
                        requesterCount={danceRequestCounts[r.danceId || r.danceName] ?? 1}
                      />
                    )}
                  </SortableQueueItem>
                ))}
              </SortableContext>
            </DndContext>

            {isSpotify && <SpotifySearch onAdd={addFromSpotify} />}

            {history.length > 0 && (
              <details className={styles.historyDetails}>
                <summary className={styles.historySummary}>
                  History ({history.length})
                  <button className={styles.clearHistBtn} onClick={e => { e.preventDefault(); clearHistory(); }}>
                    Clear
                  </button>
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
            <div className={styles.segControl}>
              <button
                className={`${styles.seg} ${pendingTab === 'dances' ? styles.segActive : ''}`}
                onClick={() => setPendingTab('dances')}
              >
                By Dance {danceGroups.length > 0 && <span className={styles.segBadge}>{danceGroups.length}</span>}
              </button>
              <button
                className={`${styles.seg} ${pendingTab === 'requesters' ? styles.segActive : ''}`}
                onClick={() => setPendingTab('requesters')}
              >
                By Requester
              </button>
            </div>
          </div>

          <div className={styles.colBody}>
            {/* By Dance */}
            {pendingTab === 'dances' && (
              danceGroups.length === 0
                ? <p className={styles.empty}>No pending requests yet.</p>
                : danceGroups.map(group => {
                    const key = group.danceId || group.danceName;
                    const expanded = expandedDances.has(key);
                    return (
                      <div key={key} className={styles.danceGroup}>
                        <div className={styles.danceGroupRow}>
                          <div className={styles.danceGroupInfo}>
                            <span className={styles.danceGroupName}>
                              {group.stepsheet
                                ? <a href={group.stepsheet} target="_blank" rel="noopener noreferrer" className={styles.pNameLink}>{group.danceName}</a>
                                : group.danceName}
                              {group.isRepeat && <span className={styles.repeatBadge}>REPEAT</span>}
                              {group.isSongSwap && <span className={styles.swapBadgePending}>↻ Swap</span>}
                            </span>
                            {group.isSongSwap && group.swapSongName && (
                              <div className={styles.danceGroupSwap}>
                                ↪ {group.swapSongName}{group.swapArtist ? ` — ${group.swapArtist}` : ''}
                              </div>
                            )}
                            <div className={styles.danceGroupSub}>
                              {group.difficulty && <span className={styles.diffPip} style={{ background: diffColor(group.difficulty) }}>{group.difficulty}</span>}
                              {group.danceType === 'partner' && group.partnerStyle && (
                                <span className={styles.partnerStylePip}>{group.partnerStyle}</span>
                              )}
                              {!group.isSongSwap && group.songName && <span className={styles.danceGroupSong}>{group.songName}{group.artist ? ` — ${group.artist}` : ''}</span>}
                            </div>
                          </div>
                          <div className={styles.danceGroupRight}>
                            {!group.danceId && (
                              <button className={styles.btnEdit} onClick={() => setEditingGroup(group)} title="Edit request">✎</button>
                            )}
                            <button className={styles.countBtn} onClick={() => toggleDance(key)}>
                              {group.score.toFixed(1)}
                              <span className={styles.countRaw}> · {group.requests.length}</span>
                              {group.totalTipCents > 0 && (
                                <span className={styles.countTip}> · ♫ {Math.round(group.totalTipCents / 5)}</span>
                              )}
                              {' '}{expanded ? '▲' : '▼'}
                            </button>
                            <button className={styles.btnApprove} onClick={() => handleAction(group.requests[0]._id, 'approve')}>
                              Queue →
                            </button>
                            <button className={styles.btnDenyGroup} onClick={() => handleAction(key, 'denyGroup', group.requests)}>
                              Deny
                            </button>
                          </div>
                        </div>
                        {expanded && (
                          <ul className={styles.danceExpanded}>
                            {group.requests.map(r => {
                              const plays = playsPerClient[r.clientId] ?? 0;
                              const weight = 1 / (1 + plays);
                              const tip = r.tipCents ?? 0;
                              return (
                                <li key={r._id} className={styles.danceExpandedRow}>
                                  <span className={styles.expandedWho}>{resolvedNames[r.clientId] || r.requesterName || r.clientId || 'Anonymous'}</span>
                                  <span className={styles.weightChip} title={`${plays} dance${plays !== 1 ? 's' : ''} played this session`}>×{weight.toFixed(2)}</span>
                                  {tip > 0 && <span className={styles.tipChip}>♫ {Math.round(tip / 5)}</span>}
                                  <span className={styles.qAge}>{timeAgo(r.createdAt)}</span>
                                  <button className={styles.btnSkipSm} onClick={() => handleAction(r._id, 'skip')}>Skip</button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })
            )}

            {/* By Requester */}
            {pendingTab === 'requesters' && (
              requesterGroups.length === 0
                ? <p className={styles.empty}>No requests yet.</p>
                : requesterGroups.map(group => {
                    const expanded = expandedRequesters.has(group.key);
                    const effectivePlays = playsPerClient[group.clientId] ?? 0;
                    const currentWeight = 1 / (1 + effectivePlays);
                    return (
                      <div key={group.key} className={styles.requesterGroup}>
                        <button className={styles.requesterRow} onClick={() => toggleRequester(group.key)}>
                          <div className={styles.requesterLeft}>
                            <span className={styles.requesterName}>{group.displayName}</span>
                            {group.clientId && group.displayName !== group.clientId && (
                              <span className={styles.qClientId}>{group.clientId}</span>
                            )}
                          </div>
                          <div className={styles.requesterRight}>
                            <span className={styles.weightChip} title="Current vote weight">×{currentWeight.toFixed(2)}</span>
                            <span className={styles.reqPill}>{group.submitted} sent</span>
                            {group.fulfilled > 0 && <span className={styles.reqPillGreen}>{group.fulfilled} played</span>}
                            <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
                          </div>
                        </button>
                        {expanded && (
                          <ul className={styles.requesterExpanded}>
                            {group.requests.map(r => (
                              <li key={r._id} className={styles.requesterExpandedRow}>
                                <span className={`${styles.statusDot} ${styles['s_' + r.status]}`} />
                                <span className={styles.expandedWho}>{r.danceName}</span>
                                <span className={styles.qAge}>{timeAgo(r.createdAt)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })
            )}

          </div>
        </section>
      </div>
    </div>
    </>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────
export default function DJControllerPage() {
  return (
    <>
      <Head><title>DJ Controller</title></Head>
      <Controller />
    </>
  );
}
