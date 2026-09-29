import React, { useState, useMemo, useEffect, useRef } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { Pencil, Check } from 'lucide-react';
import { useSession, signIn, signOut } from 'next-auth/react';
import styles from './dj-request.module.css';
import { filterAvailableDances } from '../../lib/client/dj/availableDances';
import { estimateQueueTimes, timeAgo, diffColor } from '../../components/dj-controller/utils';
import { BEAT_PACKAGES } from '../../lib/beats/packages';
import BeatTipper from '../../components/BeatTipper';
import DirectTipSection from '../../components/dj-request/DirectTipSection';
import CatalogSongPicker from '../../components/dj-request/CatalogSongPicker';
import { RequestRowActions, RequestRowPanels, SuppressedOverlay } from '../../components/dj-request/RequestRowControls';
import { danceKey, isActive, sortedQueue } from '../../lib/client/dj/queue';
import { beatsFromCents } from '../../lib/beats/constants';
import { fetcher } from '../../lib/client/fetcher';

function getOrCreateClientId() {
  let id = localStorage.getItem('dj_client_id');
  if (!id) {
    const hex = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : Array.from({ length: 8 }, () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')).join('');
    id = 'anon_' + hex;
    localStorage.setItem('dj_client_id', id);
  }
  return id;
}

function generateUserName() {
  return 'User_' + Math.floor(100 + Math.random() * 900);
}

function formatPlayTime(date) {
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function getRowStatus(requests, queueTimes) {
  if (requests.find(r => r.status === 'playing')) {
    return { label: 'Now playing', type: 'Playing' };
  }
  const approved = sortedQueue(requests)[0];
  if (approved) {
    const est = queueTimes[approved._id];
    return { label: est ? `In queue · ~${formatPlayTime(est)}` : 'In queue', type: 'Queued' };
  }
  const pending = requests
    .filter(r => r.status === 'pending')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
  if (pending) {
    const ago = timeAgo(pending.createdAt);
    return { label: ago === 'just now' ? 'Requested just now' : `Requested ${ago} ago`, type: 'Pending' };
  }
  return null;
}

export default function DJRequestPage({
  sessionId = null, djId: djIdProp = null, sessionEnded = false,
  requestsEnabled: requestsEnabledProp = true, tippingEnabled: tippingEnabledProp = null,
  partnerDancesEnabled: partnerDancesEnabledProp = true,
  queueVisibleToRequesters = true, queueVisibleCount = 4,
}) {
  const { data: authSession, status: authStatus } = useSession();
  const isLoaded = authStatus !== 'loading';
  const isSignedIn = !!authSession;
  const user = authSession?.user;

  const [localClientId, setLocalClientId] = useState('');
  const clientId = isLoaded && isSignedIn ? user.id : localClientId;

  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');

  const [requestType, setRequestType] = useState('line'); // 'line' | 'partner'
  const [isSongSwap, setIsSongSwap] = useState(false);
  const [partnerStyle, setPartnerStyle] = useState('');
  const [partnerTrack, setPartnerTrack] = useState(null); // song picked from the music catalog
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [swapSongName, setSwapSongName] = useState('');
  const [swapArtist, setSwapArtist] = useState('');
  const [notes, setNotes] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState('requests');
  const [showBeatShop, setShowBeatShop] = useState(false);
  const [buyingPackage, setBuyingPackage] = useState(null);
  const [beatsSuccess, setBeatsSuccess] = useState(false);

  const [tipSuccess, setTipSuccess] = useState(false);

  // Beat tipping state
  const [formTip, setFormTip] = useState(0);
  const [formTipReset, setFormTipReset] = useState(0);
  const [boosterOpenId, setBoosterOpenId] = useState(null);
  const [pendingRemoveId, setPendingRemoveId] = useState(null);
  const [submittingPanel, setSubmittingPanel] = useState(false);

  const nameInputRef = useRef(null);

  useEffect(() => {
    const id = getOrCreateClientId();
    setLocalClientId(id);
    const saved = localStorage.getItem('dj_display_name');
    const name = saved || generateUserName();
    if (!saved) localStorage.setItem('dj_display_name', name);
    setDisplayName(name);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    const name = user.name
      || user.email?.split('@')[0]
      || 'Dancer';
    setDisplayName(name);
  }, [isLoaded, isSignedIn, user?.id]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const { data: balanceData, mutate: mutateBalance } = useSWR(
    isSignedIn ? '/api/beats/balance' : null, fetcher,
    { revalidateOnFocus: true }
  );
  const beatBalance = balanceData?.beats ?? 0;

  // Detect return from Stripe Checkout and show success banners.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('beats_success')) {
      setBeatsSuccess(true);
      mutateBalance();
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => setBeatsSuccess(false), 5000);
    }
    if (params.get('tip_success')) {
      setTipSuccess(true);
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => setTipSuccess(false), 5000);
    }
  }, []);

  async function buyBeats(pkg) {
    setBuyingPackage(pkg.id);
    try {
      const res = await fetch('/api/beats/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id, returnUrl: window.location.href }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setBuyingPackage(null);
    }
  }

  const { data: dances = [], isLoading } = useSWR('/api/dj/dances', fetcher, { revalidateOnFocus: false });

  // Broadcast (urgent) messages the DJ sent to all users
  const broadcastUrl = sessionId ? `/api/dj/messages?sessionId=${sessionId}&audience=attendees` : null;
  const { data: broadcastData } = useSWR(broadcastUrl, fetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: false,
  });
  const broadcastMsg = (() => {
    const m = broadcastData?.message;
    if (!m) return null;
    if (m.expiresAt && new Date(m.expiresAt) <= new Date()) return null;
    return m;
  })();

  // Direct messages — signed-in users get their own poll; anonymous users get DMs via the requests response
  const { data: directMsgData, mutate: mutateDirectMsgs } = useSWR(
    isSignedIn ? '/api/dj/direct-messages' : null,
    fetcher,
    { refreshInterval: 15000, revalidateOnFocus: false }
  );

  async function clearDirectMessage(id) {
    const body = { id, ...(!isSignedIn && clientId ? { clientId } : {}) };
    if (!isSignedIn) {
      mutateRequests(
        prev => prev && typeof prev === 'object' && !Array.isArray(prev)
          ? { ...prev, directMessages: (prev.directMessages ?? []).filter(m => m._id !== id) }
          : prev,
        { revalidate: true }
      );
    }
    await fetch('/api/dj/direct-messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (isSignedIn) mutateDirectMsgs();
  }

  // Attendee notifications (beat gifts, etc.)
  const { data: attendeeNotifData, mutate: mutateAttendeeNotifs } = useSWR(
    isSignedIn ? '/api/attendee/notifications' : null,
    fetcher,
    { refreshInterval: 20000, revalidateOnFocus: false }
  );
  const attendeeNotifs = attendeeNotifData?.notifications ?? [];
  const unreadNotifCount = attendeeNotifData?.unreadCount ?? 0;

  async function dismissAttendeeNotif(id) {
    await fetch('/api/attendee/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    mutateAttendeeNotifs();
    mutateBalance(); // gift credits the beat balance
  }

  const requestsUrl = (() => {
    const base = sessionId ? `/api/dj/requests?sessionId=${sessionId}` : '/api/dj/requests';
    return clientId ? `${base}${sessionId ? '&' : '?'}clientId=${clientId}` : base;
  })();
  const { data: requestsData, mutate: mutateRequests } = useSWR(
    requestsUrl,
    fetcher,
    { refreshInterval: 10000, dedupingInterval: 2000, revalidateOnFocus: false }
  );
  const allRequests = Array.isArray(requestsData) ? requestsData : (requestsData?.requests ?? []);
  const isSuppressed = requestsData?.suppressed === true;

  // Session settings: server-rendered props first, then the live values that
  // come back with every requests poll, so the DJ's toggles apply mid-event.
  const liveSession = requestsData?.session ?? null;
  const effectivelyEnded = sessionEnded || (!!liveSession && liveSession.status !== 'active');
  const sessionActive = !!sessionId && !effectivelyEnded;
  const djId = djIdProp;
  const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
  const tippingEnabled = paymentsEnabled && (liveSession ? liveSession.tippingEnabled : (tippingEnabledProp ?? true));
  const requestsEnabled = liveSession ? liveSession.requestsEnabled : requestsEnabledProp;
  const partnerDancesEnabled = liveSession ? liveSession.partnerDancesEnabled : partnerDancesEnabledProp;
  const directMessages = isSignedIn
    ? (directMsgData?.messages ?? [])
    : (requestsData?.directMessages ?? []);

  // Collision detection — if another user has the same User_XXX display name, re-roll ours
  useEffect(() => {
    if (!allRequests.length || !localClientId || isSignedIn) return;
    const othersNames = new Set(
      allRequests
        .filter(r => r.clientId !== localClientId)
        .map(r => r.requesterName)
        .filter(Boolean)
    );
    setDisplayName(prev => {
      if (!/^User_\d+$/.test(prev) || !othersNames.has(prev)) return prev;
      let name;
      let tries = 0;
      do { name = generateUserName(); tries++; } while (othersNames.has(name) && tries < 50);
      localStorage.setItem('dj_display_name', name);
      return name;
    });
  }, [allRequests, localClientId, isSignedIn]);

  // Dances this user has already requested (active requests only, exclude DJ queue messages)
  const myActiveRequests = useMemo(() =>
    allRequests.filter(r =>
      r.clientId === clientId && r.danceType !== 'message' && isActive(r)
    ), [allRequests, clientId]);

  function alreadyRequested(dance) {
    return myActiveRequests.some(r =>
      (r.danceId && dance.id && r.danceId === dance.id) ||
      r.danceName?.toLowerCase() === dance.danceName?.toLowerCase()
    );
  }

  const requestGroups = useMemo(() => {
    const active = allRequests.filter(r => r.danceType !== 'message' && isActive(r));
    const map = {};
    for (const r of active) {
      const key = danceKey(r);
      if (!map[key]) {
        map[key] = {
          danceKey: key, danceId: r.danceId, danceName: r.danceName,
          songName: r.songName, artist: r.artist,
          difficulty: r.difficulty, stepsheet: r.stepsheet,
          duration_ms: r.duration_ms,
          danceType: r.danceType ?? null,
          partnerStyle: r.partnerStyle ?? null,
          originals: [],
          swaps: {},
        };
      }
      if (!r.isSongSwap) {
        map[key].originals.push(r);
      } else {
        const swapKey = (r.swapSongName || '').toLowerCase().trim();
        map[key].swaps[swapKey] ??= { swapSongName: r.swapSongName, swapArtist: r.swapArtist, requests: [] };
        map[key].swaps[swapKey].requests.push(r);
      }
    }
    return Object.values(map)
      .map(g => ({ ...g, swaps: Object.values(g.swaps) }))
      .sort((a, b) => a.danceName.localeCompare(b.danceName));
  }, [allRequests]);

  const queueItems = useMemo(() => {
    const playing = allRequests.filter(r => r.status === 'playing' && r.danceType !== 'message');
    const queued = sortedQueue(allRequests).filter(r => r.danceType !== 'message');
    return { playing, queued };
  }, [allRequests]);

  const queueTimes = useMemo(
    () => estimateQueueTimes(allRequests.filter(r => r.status === 'playing'), sortedQueue(allRequests)),
    [allRequests]);

  // Beats tipped per dance (all live requests), keyed like the controller.
  const beatsByDance = useMemo(() => {
    const cents = {};
    for (const r of allRequests) {
      if (!isActive(r) || r.danceType === 'message') continue;
      cents[danceKey(r)] = (cents[danceKey(r)] ?? 0) + (r.tipCents ?? 0);
    }
    return cents;
  }, [allRequests]);
  const beatsFor = r => beatsFromCents(beatsByDance[danceKey(r)]);

  const playedHistory = useMemo(() => {
    const map = {};
    for (const r of allRequests.filter(r => r.status === 'played')) {
      const key = r.danceId || r.danceName;
      if (!map[key] || new Date(r.updatedAt) > new Date(map[key].updatedAt)) map[key] = r;
    }
    return Object.values(map).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [allRequests]);

  const availableDances = useMemo(
    () => filterAvailableDances(dances, allRequests),
    [dances, allRequests]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return availableDances.slice(0, 8);
    const q = search.toLowerCase();
    return availableDances.filter(d =>
      d.danceName.toLowerCase().includes(q) ||
      d.songName.toLowerCase().includes(q) ||
      d.artist.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [availableDances, search]);

  function startEditName() {
    if (isSignedIn) return;
    setDraftName(displayName === localClientId ? '' : displayName);
    setEditingName(true);
  }

  function commitName() {
    const trimmed = draftName.trim();
    const effective = trimmed || generateUserName();
    setDisplayName(effective);
    setEditingName(false);
    localStorage.setItem('dj_display_name', effective);
  }

  function handleNameKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitName(); }
    if (e.key === 'Escape') { setEditingName(false); }
  }

  function selectDance(dance) {
    setSelected(dance);
    setSearch(dance.danceName);
  }


  function clearSelection() {
    setSelected(null);
    setSearch('');
  }

  async function submitRequest(payload) {
    const res = await fetch('/api/dj/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, clientId, requesterName: displayName, ...(sessionId ? { sessionId } : {}) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.timeState) throw new Error('The session has ended — requests are no longer being accepted.');
      throw new Error('Request failed');
    }
    return res.json();
  }

  async function tipRequest(requestId, beats) {
    const res = await fetch('/api/beats/tip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, beats }),
    });
    const body = await res.json();
    if (res.status === 403) {
      mutateRequests(); // picks up the suppressed flag
      return;
    }
    if (!res.ok) throw new Error(body.error || 'Tip failed');
    mutateBalance();
    mutateRequests();
    return body;
  }

  const customName = !selected && search.trim() && filtered.length === 0 ? search.trim() : null;
  const effectiveDance = selected ?? (customName ? { id: null, danceName: customName, songName: '', artist: '', difficulty: '', stepsheet: '', duration_ms: null, spotifyUri: null } : null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!clientId) return;
    if (requestType === 'line' && !effectiveDance) return;
    if (isSongSwap && !swapSongName.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      let doc;
      if (requestType === 'partner') {
        doc = await submitRequest({
          danceId: null,
          danceName: partnerStyle ? `Partner — ${partnerStyle}` : 'Partner Dance',
          danceType: 'partner',
          partnerStyle: partnerStyle || null,
          songName: swapSongName.trim() || null,
          artist: swapArtist.trim() || null,
          catalogTrackId: partnerTrack?.id ?? null,
          notes: notes.trim(),
        });
      } else {
        doc = await submitRequest({
          danceId: effectiveDance.id,
          danceName: effectiveDance.danceName,
          songName: isSongSwap ? swapSongName.trim() : effectiveDance.songName,
          artist: isSongSwap ? swapArtist.trim() : effectiveDance.artist,
          difficulty: effectiveDance.difficulty,
          stepsheet: effectiveDance.stepsheet,
          duration_ms: effectiveDance.duration_ms ?? null,
          spotifyUri: effectiveDance.spotifyUri ?? null,
          danceType: null,
          isSongSwap,
          swapSongName: isSongSwap ? swapSongName.trim() : null,
          swapArtist: isSongSwap ? swapArtist.trim() || null : null,
          notes: notes.trim(),
        });
      }
      // Apply the beat tip after the request is created
      if (formTip > 0 && doc?._id) {
        try { await tipRequest(doc._id, formTip); } catch { /* tip failure is non-fatal */ }
      }
      setFormTip(0);
      setFormTipReset(r => r + 1);
      setSubmitted(true);
      mutateRequests();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleAnother() {
    setSubmitted(false);
    setSelected(null);
    setSearch('');
    setIsSongSwap(false);
    setPartnerStyle('');
    setPartnerTrack(null);
    setSwapSongName('');
    setSwapArtist('');
    setNotes('');
    setShowNote(false);
    setError('');
    setFormTip(0);
    setFormTipReset(r => r + 1);
  }

  function switchType(type) {
    setRequestType(type);
    setIsSongSwap(false);
    setPartnerStyle('');
    setPartnerTrack(null);
    setSelected(null);
    setSearch('');
    setSwapSongName('');
    setSwapArtist('');
  }

  async function handlePanelRequest(group) {
    if (!clientId || submittingPanel) return;
    setSubmittingPanel(true);
    try {
      await submitRequest({
        danceId: group.danceId, danceName: group.danceName,
        songName: group.songName, artist: group.artist,
        difficulty: group.difficulty, stepsheet: group.stepsheet,
        duration_ms: group.duration_ms, notes: '',
        ...(group.danceType === 'partner' && {
          danceType: 'partner',
          partnerStyle: group.partnerStyle,
          partnerGroupId: group.danceKey,
        }),
      });
      mutateRequests();
    } finally {
      setSubmittingPanel(false);
    }
  }

  async function handlePanelRequestSwap(group, swap) {
    if (!clientId || submittingPanel) return;
    setSubmittingPanel(true);
    try {
      await submitRequest({
        danceId: group.danceId, danceName: group.danceName,
        difficulty: group.difficulty, stepsheet: group.stepsheet,
        duration_ms: group.duration_ms,
        isSongSwap: true,
        swapSongName: swap.swapSongName,
        swapArtist: swap.swapArtist ?? null,
        songName: swap.swapSongName,
        artist: swap.swapArtist ?? '',
        notes: '',
      });
      mutateRequests();
    } finally {
      setSubmittingPanel(false);
    }
  }

  async function handlePanelRemove(requestId) {
    await fetch(`/api/dj/requests/${requestId}?clientId=${encodeURIComponent(clientId)}`, { method: 'DELETE' });
    setPendingRemoveId(null);
    mutateRequests();
  }

  function requestRemoveClick(request, isLast = false) {
    if ((request.tipCents ?? 0) > 0 || isLast) {
      setPendingRemoveId(request._id);
    } else {
      handlePanelRemove(request._id);
    }
  }

  // Controls for one request row (original dance or a song-swap variant).
  // `mine` is the attendee's own request in that row, if any.
  function renderRowActions(mine, count, onAdd, addTitle) {
    return (
      <RequestRowActions
        myRequest={mine}
        count={count}
        canTip={tippingEnabled && isSignedIn}
        beatBalance={beatBalance}
        boosterOpen={!!mine && boosterOpenId === mine._id}
        onToggleBooster={() => setBoosterOpenId(id => (id === mine._id ? null : mine._id))}
        onGetBeats={() => setShowBeatShop(true)}
        onAdd={onAdd}
        addDisabled={submittingPanel}
        addTitle={addTitle}
        onRemove={() => requestRemoveClick(mine, count === 1)}
      />
    );
  }

  function renderRowPanels(mine, isLast, lastLabel) {
    return (
      <RequestRowPanels
        myRequest={mine}
        isLast={isLast}
        lastLabel={lastLabel}
        beatBalance={beatBalance}
        boosterOpen={!!mine && boosterOpenId === mine._id}
        confirmingRemove={!!mine && pendingRemoveId === mine._id}
        onTip={async (beats) => { await tipRequest(mine._id, beats); setBoosterOpenId(null); }}
        onCloseBooster={() => setBoosterOpenId(null)}
        onCancelRemove={() => setPendingRemoveId(null)}
        onConfirmRemove={() => handlePanelRemove(mine._id)}
      />
    );
  }

  if (submitted) {
    return (
      <>
        <Head><title>Request Submitted</title></Head>
        <div className={styles.page}>
          <div className={styles.card}>
            <div className={styles.successIcon}>✓</div>
            <h1 className={styles.successTitle}>Request Sent!</h1>
            <p className={styles.successSub}>
              Your request for <strong>{effectiveDance?.danceName}</strong> is in the queue. The DJ will review it!
            </p>
            <button className={styles.anotherBtn} onClick={handleAnother}>
              Request Another Dance
            </button>
          </div>
        </div>
      </>
    );
  }

  const directTip = djId && tippingEnabled ? (
    <DirectTipSection
      djId={djId}
      showBeatsNudge={sessionActive}
      isSignedIn={isSignedIn}
      onGetBeats={() => setShowBeatShop(true)}
      onSignIn={() => signIn('ldco', { callbackUrl: window.location.href })}
    />
  ) : null;

  if (!sessionActive) {
    return (
      <>
        <Head><title>Request a Dance</title></Head>
        <div className={styles.page}>
          <div className={styles.card}>
            {effectivelyEnded ? (

              <>
                <div className={styles.noSessionIcon}>🎵</div>
                <h1 className={styles.noSessionTitle}>Session has ended</h1>
                <p className={styles.noSessionSub}>The DJ has closed the request queue for tonight. Thanks for coming out!</p>
                {directTip}
              </>
            ) : (
              <>
                <div className={styles.noSessionIcon}>🎵</div>
                <h1 className={styles.noSessionTitle}>Not Started Yet</h1>
                <p className={styles.noSessionSub}>
                  The DJ hasn&apos;t opened the request queue yet. Check back in a few minutes!
                </p>
                <p className={styles.noSessionHint}>This page will update automatically.</p>
              </>
            )}
          </div>
        </div>
        {isSuppressed && (
          <SuppressedOverlay />
        )}
      </>
    );
  }

  return (
    <>
      <Head><title>Request a Dance</title></Head>
      <div className={styles.page}>

        {/* ── Main card ── */}
        <div className={styles.card}>
          <h1 className={styles.heading}>
            Welcome,{' '}
            {editingName ? (
              <>
                <input
                  ref={nameInputRef}
                  className={styles.nameInput}
                  type="text"
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={handleNameKeyDown}
                  placeholder={displayName}
                  maxLength={60}
                />
                <button type="button" className={styles.nameAction} onClick={commitName} aria-label="Save name">
                  <Check size={16} strokeWidth={2.5} />
                </button>
              </>
            ) : (
              <>
                <span className={styles.identityName}>{displayName || clientId}</span>
                {!isSignedIn && (
                  <button type="button" className={styles.nameAction} onClick={startEditName} aria-label="Edit name">
                    <Pencil size={18} strokeWidth={2} />
                  </button>
                )}
              </>
            )}
          </h1>
          <p className={styles.sub}>What do you want to dance?</p>

          {/* ── DJ broadcast message ── */}
          {broadcastMsg && (
            <div className={styles.djBroadcastBanner}>
              <span className={styles.djBroadcastIcon}>📢</span>
              <span className={styles.djBroadcastText}>{broadcastMsg.text}</span>
            </div>
          )}

          {/* ── Direct messages from DJ ── */}
          {directMessages.map(dm => (
            <div key={dm._id} className={styles.djDirectMsg}>
              <div className={styles.djDirectMsgHead}>
                <span className={styles.djDirectMsgLabel}>Message from DJ</span>
                <button className={styles.djDirectMsgClose} onClick={() => clearDirectMessage(dm._id)}>✕</button>
              </div>
              <p className={styles.djDirectMsgText}>{dm.text}</p>
            </div>
          ))}

          {/* ── Attendee notifications (beat gifts) ── */}
          {attendeeNotifs.filter(n => !n.read).map(n => (
            <div key={n._id} className={styles.attendeeNotif}>
              <div className={styles.attendeeNotifHead}>
                <span className={styles.attendeeNotifIcon}>🎁</span>
                <span className={styles.attendeeNotifTitle}>
                  {n.fromName} gifted you {n.beats} beat{n.beats !== 1 ? 's' : ''}!
                </span>
                <button className={styles.attendeeNotifDismiss} onClick={() => dismissAttendeeNotif(n._id)}>✓</button>
              </div>
              {n.message && <p className={styles.attendeeNotifMsg}>{n.message}</p>}
            </div>
          ))}

          {/* ── Success banners ── */}
          {tippingEnabled && beatsSuccess && (
            <div className={styles.beatsSuccessBanner}>
              Beats added to your balance!
            </div>
          )}
          {tippingEnabled && tipSuccess && (
            <div className={styles.tipSuccessBanner}>
              Thanks for supporting the DJ!
            </div>
          )}

          {/* ── Account / Beats bar ── */}
          {isLoaded && (
            <div className={styles.accountBar}>
              {isSignedIn ? (
                <>
                  <div className={styles.accountBarSignedIn}>
                    <div className={styles.accountIdentity}>
                      <span className={styles.accountEmail}>
                        {user.email}
                      </span>
                      <button className={styles.signOutBtn} onClick={() => signOut({ callbackUrl: window.location.href })}>
                        Sign out
                      </button>
                    </div>
                    {tippingEnabled && (
                      <div className={styles.accountBarActions}>
                        <span className={styles.beatBalance}>
                      <img src="/beats/coin_front.png" className={styles.coinIcon} alt="" aria-hidden="true" />
                      {beatBalance} Beats
                    </span>
                        <button className={styles.accountBarBtn} onClick={() => setShowBeatShop(v => !v)}>
                          {showBeatShop ? 'Close' : 'Buy Beats'}
                        </button>
                      </div>
                    )}
                  </div>

                  {tippingEnabled && showBeatShop && (
                    <div className={styles.beatShop}>
                      <div className={styles.beatShopHeader}>
                        <img src="/beats/beat_text.png" className={styles.beatShopLogo} alt="beat" />
                      </div>
                      {BEAT_PACKAGES.map(pkg => (
                        <button
                          key={pkg.id}
                          className={`${styles.beatPkg} ${pkg.featured ? styles.beatPkgFeatured : ''}`}
                          onClick={() => buyBeats(pkg)}
                          disabled={buyingPackage === pkg.id}
                        >
                          <span className={styles.beatPkgLabel}>{pkg.label}{pkg.featured ? ' ⭐' : ''}</span>
                          <span className={styles.beatPkgBeats}>
                            {pkg.bonus > 0
                              ? <>{pkg.base} <span className={styles.beatPkgBonus}>+{pkg.bonus}</span> Beats</>
                              : <>{pkg.beats} Beats</>}
                          </span>
                          <span className={styles.beatPkgPrice}>
                            ${(pkg.priceCents / 100).toFixed(2)}
                          </span>
                        </button>
                      ))}
                      <ul className={styles.beatShopValueProps}>
                        <li>✓ No processing fee — 100% goes to the DJ</li>
                        <li>✓ Tip a specific dance request to boost its priority</li>
                        <li>✓ More beats = higher in the DJ&apos;s queue</li>
                        <li>✓ Doesn&apos;t guarantee play, but it helps</li>
                      </ul>
                    </div>
                  )}
                </>
              ) : tippingEnabled ? (
                <div className={styles.beatsSignInPrompt}>
                  <div className={styles.beatsSignInTopRow}>
                    <img src="/beats/coin_front.png" className={styles.beatsSignInCoin} alt="" aria-hidden="true" />
                    <p className={styles.beatsSignInHeading}>Tip your requests with <img src="/beats/beat_text.png" className={styles.beatsWordmark} alt="beat" /></p>
                  </div>
                  <p className={styles.beatsSignInSub}>No processing fees — 100% goes to the DJ. Tip a specific dance to boost it in the queue.</p>
                  <button
                    className={styles.beatsSignInBtn}
                    onClick={() => signIn('ldco', { callbackUrl: window.location.href })}
                  >
                    Sign in to use Beats
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* ── Submission form — hidden when requests are paused ── */}
          {requestsEnabled && (<>

          {/* ── Line / Partner toggle — only shown when partner dances are enabled ── */}
          {partnerDancesEnabled && (
            <div className={styles.typeSegment}>
              <button type="button"
                className={`${styles.typeSegBtn} ${requestType === 'line' ? styles.typeSegBtnActive : ''}`}
                onClick={() => switchType('line')}>
                Line Dance
              </button>
              <button type="button"
                className={`${styles.typeSegBtn} ${requestType === 'partner' ? styles.typeSegBtnActive : ''}`}
                onClick={() => switchType('partner')}>
                Partner Dance
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>

            {/* ── Line dance form ── */}
            {requestType === 'line' && (
              <div className={styles.field}>
                <label className={styles.label}>Dance *</label>
                {selected ? (
                  <div className={`${styles.selectedDance} ${alreadyRequested(selected) ? styles.selectedDanceMine : ''}`}>
                    <div className={styles.selectedInfo}>
                      <span className={styles.selectedName}>{selected.danceName}</span>
                      {alreadyRequested(selected) && (
                        <span className={styles.alreadyRequestedNote}>You already have this in the queue</span>
                      )}
                      {selected.songName && (
                        <span className={styles.selectedSong}>{selected.songName}{selected.artist ? ` — ${selected.artist}` : ''}</span>
                      )}
                      {selected.difficulty && (
                        <span className={styles.diffBadge} style={{ background: diffColor(selected.difficulty) }}>
                          {selected.difficulty}
                        </span>
                      )}
                    </div>
                    <button type="button" className={styles.clearBtn} onClick={clearSelection} aria-label="Clear selection">✕</button>
                  </div>
                ) : (
                  <>
                    <input
                      className={styles.input}
                      type="text"
                      placeholder={isLoading ? 'Loading dances…' : 'Search by dance or song name…'}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      autoComplete="off"
                      disabled={isLoading}
                    />
                    {search.length > 0 && filtered.length > 0 && (
                      <ul className={styles.suggestions}>
                        {filtered.map(d => {
                          const mine = alreadyRequested(d);
                          return (
                            <li key={d.id}>
                              {mine ? (
                                <div className={styles.suggestionMine}>
                                  <div className={styles.suggMineLeft}>
                                    <span className={styles.suggName}>{d.danceName}</span>
                                    <span className={styles.suggMeta}>
                                      {d.songName ? `${d.songName}${d.artist ? ` — ${d.artist}` : ''}` : ''}
                                    </span>
                                  </div>
                                  <span className={styles.suggMineTag}>Already requested</span>
                                </div>
                              ) : (
                                <button type="button" className={styles.suggestion} onClick={() => selectDance(d)}>
                                  <span className={styles.suggName}>{d.danceName}</span>
                                  <span className={styles.suggMeta}>
                                    {d.songName ? `${d.songName}${d.artist ? ` — ${d.artist}` : ''}` : ''}
                                  </span>
                                  {d.difficulty && (
                                    <span className={styles.suggDiff} style={{ color: diffColor(d.difficulty) }}>
                                      {d.difficulty}
                                    </span>
                                  )}
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Partner dance form ── */}
            {requestType === 'partner' && (
              <div className={styles.partnerForm}>
                <p className={styles.partnerHint}>Request a partner dance. Specify a style and/or song if you have one in mind.</p>
                <label className={styles.label}>Style <span className={styles.optionalLabel}>(optional)</span></label>
                <div className={styles.field}>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="e.g. Two-Step, Waltz, Swing…"
                    value={partnerStyle}
                    onChange={e => setPartnerStyle(e.target.value)}
                    maxLength={60}
                    autoComplete="off"
                  />
                  {partnerStyle.trim() && (() => {
                    const q = partnerStyle.toLowerCase();
                    const matches = ['Two-Step','Waltz','Cha-Cha','Swing','West Coast Swing','Polka','Nightclub 2-Step']
                      .filter(s => s.toLowerCase().includes(q) && s.toLowerCase() !== q);
                    return matches.length > 0 ? (
                      <ul className={styles.suggestions}>
                        {matches.map(s => (
                          <li key={s}>
                            <button type="button" className={styles.suggestion} onClick={() => setPartnerStyle(s)}>
                              <span className={styles.suggName}>{s}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null;
                  })()}</div>
                <label className={styles.label}>Song <span className={styles.optionalLabel}>(optional)</span></label>
                <CatalogSongPicker
                  text={swapSongName}
                  onTextChange={setSwapSongName}
                  track={partnerTrack}
                  onTrackChange={setPartnerTrack}
                  artist={swapArtist}
                  onArtistChange={setSwapArtist}
                />
              </div>
            )}

            {/* ── Song swap fields (line dance only) — shown when expanded ── */}
            {requestType === 'line' && isSongSwap && (
              <div className={styles.swapFields}>
                <label className={styles.label}>Song to swap to</label>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Song name *"
                  value={swapSongName}
                  onChange={e => setSwapSongName(e.target.value)}
                  maxLength={100}
                  autoFocus
                  required
                />
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Artist (optional)"
                  value={swapArtist}
                  onChange={e => setSwapArtist(e.target.value)}
                  maxLength={100}
                />
              </div>
            )}

            {/* ── Note field ── */}
            {showNote && (
              <div className={styles.field}>
                <label className={styles.label}>Note to DJ</label>
                <textarea
                  className={styles.textarea}
                  placeholder="Any special notes or reason for this request…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  maxLength={200}
                  rows={3}
                  autoFocus
                />
                <span className={styles.charCount}>{notes.length}/200</span>
              </div>
            )}

            {/* ── Secondary action buttons ── */}
            {(!showNote || (requestType === 'line' && !isSongSwap)) && (
              <div className={styles.secondaryActions}>
                {!showNote && (
                  <button type="button" className={styles.addNoteBtn} onClick={() => setShowNote(true)}>
                    + Add a note
                  </button>
                )}
                {requestType === 'line' && !isSongSwap && (
                  <button type="button" className={styles.addNoteBtn} onClick={() => setIsSongSwap(true)}>
                    🎵 Song swap
                  </button>
                )}
              </div>
            )}

            {/* ── Beat tip (form mode) ── */}
            {tippingEnabled && isSignedIn && effectiveDance && (
              <div className={styles.field}>
                <label className={styles.label}>Boost with Beats</label>
                <BeatTipper
                  mode="form"
                  balance={beatBalance}
                  onPendingChange={setFormTip}
                  resetSignal={formTipReset}
                />
                {formTip > 0 && (
                  <p className={styles.tipFormSummary}>
                    + {formTip} Beats will be added when you submit
                  </p>
                )}
              </div>
            )}

            {error && <p className={styles.errorMsg}>{error}</p>}

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={
                submitting || !clientId ||
                (requestType === 'line' && (!effectiveDance || (selected && alreadyRequested(selected)))) ||
                (requestType === 'line' && isSongSwap && !swapSongName.trim())
              }
            >
              {submitting ? 'Sending…' : 'Submit Request'}
            </button>
          </form>

          </>)}

          {/* ── Direct tip ── */}
          {directTip}
        </div>

        {/* ── Tabbed section ── */}
        <div className={styles.tabSection}>
          <div className={styles.tabBar}>
            <button
              className={`${styles.tab} ${activeTab === 'requests' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('requests')}
            >
              Requests
              {requestGroups.length > 0 && (
                <span className={styles.tabBadge}>{requestGroups.length}</span>
              )}
            </button>
            {queueVisibleToRequesters && (
              <button
                className={`${styles.tab} ${activeTab === 'queue' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('queue')}
              >
                Queue
                {(queueItems.playing.length + queueItems.queued.length) > 0 && (
                  <span className={styles.tabBadge}>{queueItems.playing.length + queueItems.queued.length}</span>
                )}
              </button>
            )}
            <button
              className={`${styles.tab} ${activeTab === 'history' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('history')}
            >
              History
              {playedHistory.length > 0 && (
                <span className={styles.tabBadge}>{playedHistory.length}</span>
              )}
            </button>
          </div>

          <div className={styles.tabContent}>
            {activeTab === 'queue' && (() => {
              const { playing, queued } = queueItems;
              const total = playing.length + queued.length;
              if (total === 0) {
                return <p className={styles.tabEmpty}>The queue is empty right now.</p>;
              }
              const limit = queueVisibleCount === 0 ? queued.length : Math.max(0, queueVisibleCount - playing.length);
              const visibleQueued = queued.slice(0, limit);
              return (
                <div className={styles.queueList}>
                  {playing.map((r, i) => (
                    <div key={r._id} className={`${styles.queueItem} ${styles.queueItemPlaying}`}>
                      <span className={styles.queueItemPos}>▶</span>
                      <div className={styles.queueItemInfo}>
                        <span className={styles.queueItemName}>{r.danceName}</span>
                        {r.songName && <span className={styles.queueItemSong}>{r.songName}{r.artist ? ` — ${r.artist}` : ''}</span>}
                      </div>
                      {beatsFor(r) > 0 && <span className={styles.queueItemBeats}><img src="/beats/coin.gif" className={styles.coinIcon} alt="" aria-hidden="true" />{beatsFor(r)}</span>}
                      <span className={styles.queueItemStatus}>Now Playing</span>
                    </div>
                  ))}
                  {visibleQueued.map((r, i) => (
                    <div key={r._id} className={styles.queueItem}>
                      <span className={styles.queueItemPos}>{playing.length + i + 1}</span>
                      <div className={styles.queueItemInfo}>
                        <span className={styles.queueItemName}>{r.danceName}</span>
                        {r.songName && <span className={styles.queueItemSong}>{r.songName}{r.artist ? ` — ${r.artist}` : ''}</span>}
                      </div>
                      {beatsFor(r) > 0 && <span className={styles.queueItemBeats}><img src="/beats/coin.gif" className={styles.coinIcon} alt="" aria-hidden="true" />{beatsFor(r)}</span>}
                    </div>
                  ))}
                </div>
              );
            })()}
            {activeTab === 'requests' && (
              !requestsEnabled ? (
                <div className={styles.pausedNotice}>
                  <div className={styles.noSessionIcon}>🎵</div>
                  <h2 className={styles.noSessionTitle}>Requests Paused</h2>
                  <p className={styles.noSessionSub}>The DJ has paused requests for now. Check back in a moment!</p>
                  <p className={styles.noSessionHint}>This page will update automatically.</p>
                </div>
              ) : requestGroups.length === 0 ? (
                <p className={styles.tabEmpty}>No active requests yet.</p>
              ) : requestGroups.map(group => {
                const myOriginal = group.originals.find(r => r.clientId === clientId);
                const totalOriginals = group.originals.length;
                const totalBeats = beatsFromCents([
                  ...group.originals,
                  ...group.swaps.flatMap(s => s.requests),
                ].reduce((sum, r) => sum + (r.tipCents ?? 0), 0));
                return (
                  <div key={group.danceKey} className={styles.tabGroup}>
                    {/* Dance name / partner song header */}
                    {group.danceType === 'partner' ? (
                      <div className={styles.tabGroupName}>
                        {totalBeats > 0 && <span className={styles.tabGroupBeats}><img src="/beats/coin.gif" className={styles.coinIcon} alt="" aria-hidden="true" />{totalBeats}</span>}
                        <span>
                          {group.songName
                            ? <>{group.songName}{group.artist ? <span className={styles.tabGroupNameArtist}> — {group.artist}</span> : ''}</>
                            : group.partnerStyle || 'Partner Dance'}
                        </span>
                      </div>
                    ) : (
                      <div className={styles.tabGroupName}>
                        {totalBeats > 0 && <span className={styles.tabGroupBeats}><img src="/beats/coin.gif" className={styles.coinIcon} alt="" aria-hidden="true" />{totalBeats}</span>}
                        <span>{group.danceName}</span>
                      </div>
                    )}

                    {/* Original version row (only if anyone requested it) */}
                    {totalOriginals > 0 && (
                      <>
                        <div className={styles.tabRow}>
                          <div className={styles.tabRowInfo}>
                            {group.danceType === 'partner' ? (
                              <span className={styles.tabRowPartnerBadge}>Partner Dance</span>
                            ) : (
                              group.songName && (
                                <span className={styles.tabRowSong}>
                                  {group.songName}{group.artist ? ` — ${group.artist}` : ''}
                                </span>
                              )
                            )}
                            {(() => { const s = getRowStatus(group.originals, queueTimes); return s ? <span className={styles[`tabRowStatus${s.type}`]}>{s.label}</span> : null; })()}
                          </div>
                          {renderRowActions(myOriginal, totalOriginals, () => handlePanelRequest(group), 'Add your request')}
                        </div>
                        {renderRowPanels(myOriginal, totalOriginals === 1, 'dance')}
                      </>
                    )}

                    {/* Swap variant rows */}
                    {group.swaps.map(swap => {
                      const mySwap = swap.requests.find(r => r.clientId === clientId);
                      return (
                        <React.Fragment key={swap.swapSongName}>
                          <div className={`${styles.tabRow} ${styles.tabRowSwap}`}>
                            <div className={styles.tabRowInfo}>
                              <span className={styles.tabRowSwapLabel}>↪ {swap.swapSongName}</span>
                              {swap.swapArtist && <span className={styles.tabRowSong}>{swap.swapArtist}</span>}
                              {(() => { const s = getRowStatus(swap.requests, queueTimes); return s ? <span className={styles[`tabRowStatus${s.type}`]}>{s.label}</span> : null; })()}
                            </div>
                            {renderRowActions(mySwap, swap.requests.length, () => handlePanelRequestSwap(group, swap), 'Support this song swap')}
                          </div>
                          {renderRowPanels(mySwap, swap.requests.length === 1, 'song swap')}
                        </React.Fragment>
                      );
                    })}
                  </div>
                );
              })
            )}

            {activeTab === 'history' && (
              playedHistory.length === 0 ? (
                <p className={styles.tabEmpty}>No dances have been played yet.</p>
              ) : playedHistory.map(r => (
                <div key={r._id} className={styles.tabRow}>
                  <div className={styles.tabRowInfo}>
                    <span className={styles.tabRowName}>{r.danceName}</span>
                    {r.songName && (
                      <span className={styles.tabRowSong}>{r.songName}{r.artist ? ` — ${r.artist}` : ''}</span>
                    )}
                  </div>
                  <span className={styles.playTime}>{formatPlayTime(r.updatedAt)}</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* ── Suppression overlay ── */}
      {isSuppressed && (
        <SuppressedOverlay />
      )}
    </>
  );
}
