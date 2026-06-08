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
  SortableContext, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import styles from './dj-controller.module.css';
import { buildPendingGroups } from '../../lib/client/dj/pendingGroups';
import { buildPlaysPerClient } from '../../lib/client/dj/fairnessScore';
import { remainingMs } from '../../lib/client/dj/autoAdvance';
import { StandardAdapter, SpotifyAdapter } from '../../lib/client/dj/controllerAdapters';
import { patch, del } from '../../lib/client/dj/requests';
import { useSpotifyPlugin } from '../../lib/client/dj/plugins/useSpotifyPlugin';
import sp from '../dj-spotify/dj-spotify.module.css';
import { SpotifyPanel, SpotifySearch } from '../../components/dj-controller/SpotifyComponents';
import SortableQueueItem from '../../components/dj-controller/SortableQueueItem';
import RemoteControl from '../../components/dj-controller/RemoteControl';
import QueueCard from '../../components/dj-controller/QueueCard';
import { diffColor, timeAgo } from '../../components/dj-controller/utils';
import PendingCard from '../../components/dj-controller/PendingCard';
import SessionsPanel from '../../components/dj-controller/SessionsPanel';
import CustomEditModal from '../../components/dj-controller/CustomEditModal';

const fetcher = url => fetch(url).then(r => r.json());

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

  // ── Queue reorder: debounce + diff state ──
  const dbPositionsRef = useRef(null);   // last-confirmed DB positions
  const pendingReorderRef = useRef(null); // latest intended order waiting to flush
  const reorderTimerRef = useRef(null);


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

  // ── Spotify plugin ────────────────────────────────────────────────────────────
  const spotify = useSpotifyPlugin({ isActive: isSpotify, rawRequests, mutate });

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
    if (isSpotify) await spotify.onCloseSession();
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

  // Keep dbPositionsRef in sync with what the server knows
  useEffect(() => {
    if (!dbPositionsRef.current) {
      dbPositionsRef.current = Object.fromEntries(queue.map(r => [r._id, r.queuePosition ?? 0]));
      return;
    }
    const currentIds = new Set(queue.map(r => r._id));
    for (const id of Object.keys(dbPositionsRef.current)) {
      if (!currentIds.has(id)) delete dbPositionsRef.current[id];
    }
    for (const r of queue) {
      if (!(r._id in dbPositionsRef.current)) {
        dbPositionsRef.current[r._id] = r.queuePosition ?? 0;
      }
    }
  }, [queue]);

  useEffect(() => () => { if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current); }, []);

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

  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = queue.findIndex(r => r._id === active.id);
    const newIdx = queue.findIndex(r => r._id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(queue, oldIdx, newIdx);

    // Optimistic UI update — instant, no network call yet
    mutate(prev => {
      const pos = Object.fromEntries(reordered.map((r, i) => [r._id, i + 1]));
      return prev.map(r => r._id in pos ? { ...r, queuePosition: pos[r._id] } : r);
    }, false);

    // Accumulate the latest intended order and debounce the write
    pendingReorderRef.current = reordered;
    if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
    reorderTimerRef.current = setTimeout(async () => {
      const finalQueue = pendingReorderRef.current;
      if (!finalQueue) return;
      const newPositions = Object.fromEntries(finalQueue.map((r, i) => [r._id, i + 1]));
      const dbPos = dbPositionsRef.current ?? {};
      const changed = finalQueue.filter(r => r._id in dbPos && dbPos[r._id] !== newPositions[r._id]);
      if (changed.length > 0) {
        await Promise.all(changed.map(r => patch(r._id, { queuePosition: newPositions[r._id] })));
        Object.assign(dbPositionsRef.current, newPositions);
      }
      pendingReorderRef.current = null;
      mutate();
    }, 600);
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
    } else if (action === 'dequeue') {
      await patch(id, { status: 'pending', queuePosition: null });
    } else if (action === 'remove') {
      await del(id);
    } else if (action === 'startQueue') {
      const stamps = isSpotify ? SpotifyAdapter.playingStamps() : StandardAdapter.playingStamps();
      await patch(id, { status: 'playing', playStartedAt: new Date().toISOString(), ...stamps });
      if (isSpotify) await spotify.onStartQueue(id);
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
  }, [nextQueuePos, queue, rawRequests, mutate, isSpotify, spotify]);

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
              spotify.connected
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
                {isSpotify && !spotify.connected && (
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
                data={spotify.data}
                onControl={spotify.handleControl}
                connected={spotify.connected}
                error={spotify.error}
                onRetry={spotify.retry}
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

            {isSpotify && <SpotifySearch onAdd={(track) => spotify.handleAdd(track, nextQueuePos)} />}

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
