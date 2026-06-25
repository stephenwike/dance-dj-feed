import React, { useState, useMemo, useEffect, useRef } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { Pencil, Check } from 'lucide-react';
import { useSession, signIn, signOut } from 'next-auth/react';
import styles from './dj-request.module.css';
import { filterAvailableDances } from '../../lib/client/dj/availableDances';
import { BEAT_PACKAGES } from '../../lib/beats/packages';
import BeatTipper from '../../components/BeatTipper';
import BeatBooster from '../../components/BeatBooster';

const fetcher = url => fetch(url).then(r => r.json());

const DIFF_COLORS = {
  beginner: '#22c55e',
  improver: '#3b82f6',
  intermediate: '#f59e0b',
  advanced: '#ef4444',
};

function diffColor(d = '') {
  const key = Object.keys(DIFF_COLORS).find(k => d.toLowerCase().includes(k));
  return key ? DIFF_COLORS[key] : '#8A5CFF';
}

function getOrCreateClientId() {
  let id = localStorage.getItem('dj_client_id');
  if (!id) {
    id = 'User_' + Math.floor(100 + Math.random() * 900);
    localStorage.setItem('dj_client_id', id);
  }
  return id;
}

function formatPlayTime(date) {
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function DJRequestPage({ sessionId = null, djId: djIdProp = null, sessionEnded = false, tippingEnabled: tippingEnabledProp = null }) {
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

  // Direct tip state
  const [directTipCents, setDirectTipCents] = useState(null);
  const [directTipCustom, setDirectTipCustom] = useState('');
  const [directTipping, setDirectTipping] = useState(false);
  const [tipSuccess, setTipSuccess] = useState(false);

  // Beat tipping state
  const [formTip, setFormTip] = useState(0);
  const [formTipReset, setFormTipReset] = useState(0);
  const [boosterOpenId, setBoosterOpenId] = useState(null);
  // Quick-tip (+1) debounce: accumulates taps and fires one API call after 600ms idle
  const quickTipRef = useRef({ id: null, count: 0, timer: null });
  const [quickTipDisplay, setQuickTipDisplay] = useState(null); // { id, count } for live display
  const [pendingRemoveId, setPendingRemoveId] = useState(null);

  const nameInputRef = useRef(null);

  useEffect(() => {
    const id = getOrCreateClientId();
    setLocalClientId(id);
    const saved = localStorage.getItem('dj_display_name');
    setDisplayName(saved || id);
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

  async function sendDirectTip() {
    const cents = directTipCents === 'custom'
      ? Math.round(parseFloat(directTipCustom) * 100)
      : directTipCents;
    if (!cents || cents < 100 || !djId) return;
    setDirectTipping(true);
    try {
      const res = await fetch('/api/tips/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ djId, amountCents: cents, returnUrl: window.location.href }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setDirectTipping(false);
    }
  }

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

  const { data: sessions } = useSWR('/api/dj/sessions', fetcher, {
    refreshInterval: 20000,
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  });
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const activeSession = sessionList.find(s => s.status === 'active') ?? null;

  // Detect session ending mid-visit (only when the SWR is accessible — i.e. the DJ's own browser).
  // sessionId is non-null only when the session was active at page load time.
  const sessionEndedMidVisit = !!sessionId && sessionList.length > 0 && !activeSession;
  const effectivelyEnded = sessionEnded || sessionEndedMidVisit;

  // sessionActive: use sessionId (server truth) as the primary signal so unauthenticated
  // attendees see the form without needing access to the protected /api/dj/sessions route.
  const sessionActive = !!sessionId && !effectivelyEnded;
  const sessionChecked = true;
  const partnerDancesEnabled = activeSession?.partnerDancesEnabled !== false; // default true
  // djId: from slug prop (works even after session ends) or from live active session
  const djId = djIdProp ?? activeSession?.ownerId ?? null;
  // tippingEnabled: from slug prop (server-rendered) or from live session (non-slug page)
  const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
  const tippingEnabled = paymentsEnabled && (tippingEnabledProp ?? (activeSession?.tippingEnabled !== false));

  const { data: dances = [], isLoading } = useSWR('/api/dj/dances', fetcher, { revalidateOnFocus: false });

  const { data: allRequests = [], mutate: mutateRequests } = useSWR(
    '/api/dj/requests',
    fetcher,
    { refreshInterval: 10000, dedupingInterval: 2000, revalidateOnFocus: false }
  );

  // Dances this user has already requested (active requests only, exclude DJ queue messages)
  const myActiveRequests = useMemo(() =>
    allRequests.filter(r =>
      r.clientId === clientId &&
      r.danceType !== 'message' &&
      ['pending', 'approved', 'playing'].includes(r.status)
    ), [allRequests, clientId]);

  function alreadyRequested(dance) {
    return myActiveRequests.some(r =>
      (r.danceId && dance.id && r.danceId === dance.id) ||
      r.danceName?.toLowerCase() === dance.danceName?.toLowerCase()
    );
  }

  const requestGroups = useMemo(() => {
    const active = allRequests.filter(r => r.danceType !== 'message' && ['pending', 'approved', 'playing'].includes(r.status));
    const map = {};
    for (const r of active) {
      const danceKey = r.danceId || r.danceName;
      if (!map[danceKey]) {
        map[danceKey] = {
          danceKey, danceId: r.danceId, danceName: r.danceName,
          songName: r.songName, artist: r.artist,
          difficulty: r.difficulty, stepsheet: r.stepsheet,
          duration_ms: r.duration_ms,
          originals: [],
          swaps: {},
        };
      }
      if (!r.isSongSwap) {
        map[danceKey].originals.push(r);
      } else {
        const swapKey = (r.swapSongName || '').toLowerCase().trim();
        if (!map[danceKey].swaps[swapKey]) {
          map[danceKey].swaps[swapKey] = {
            swapSongName: r.swapSongName, swapArtist: r.swapArtist, requests: [],
          };
        }
        map[danceKey].swaps[swapKey].requests.push(r);
      }
    }
    return Object.values(map)
      .map(g => ({ ...g, swaps: Object.values(g.swaps) }))
      .sort((a, b) => a.danceName.localeCompare(b.danceName));
  }, [allRequests]);

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
    const effective = trimmed || localClientId;
    setDisplayName(effective);
    setEditingName(false);
    if (trimmed && trimmed !== localClientId) {
      localStorage.setItem('dj_display_name', trimmed);
    } else {
      localStorage.removeItem('dj_display_name');
    }
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
    if (!res.ok) throw new Error(body.error || 'Tip failed');
    mutateBalance();
    mutateRequests();
    return body;
  }

  function handleQuickBoost(request) {
    const ref = quickTipRef.current;
    // Switching to a different request — flush any pending first
    if (ref.id && ref.id !== request._id && ref.count > 0) {
      clearTimeout(ref.timer);
      const id = ref.id; const count = ref.count;
      ref.id = null; ref.count = 0; ref.timer = null;
      setQuickTipDisplay(null);
      tipRequest(id, count);
    }
    if (ref.id !== request._id) { ref.id = request._id; ref.count = 0; }

    const existingBeats = Math.round((request.tipCents ?? 0) / 5);
    const nextCount = ref.count + 1;
    const nextTotal = existingBeats + nextCount;

    // Open booster for confirm when a threshold would be crossed
    if (nextTotal > 100 || (beatBalance > 0 && nextCount / beatBalance >= 0.5)) {
      if (ref.count > 0) {
        clearTimeout(ref.timer);
        const id = ref.id; const count = ref.count;
        ref.id = null; ref.count = 0; ref.timer = null;
        setQuickTipDisplay(null);
        tipRequest(id, count);
      }
      setBoosterOpenId(request._id);
      return;
    }

    ref.count = nextCount;
    setQuickTipDisplay({ id: request._id, count: nextCount });
    clearTimeout(ref.timer);
    ref.timer = setTimeout(() => {
      const id = ref.id; const count = ref.count;
      ref.id = null; ref.count = 0; ref.timer = null;
      setQuickTipDisplay(null);
      tipRequest(id, count);
    }, 600);
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
    setSelected(null);
    setSearch('');
    setSwapSongName('');
    setSwapArtist('');
  }

  async function handlePanelRequest(group) {
    if (!clientId) return;
    await submitRequest({
      danceId: group.danceId, danceName: group.danceName,
      songName: group.songName, artist: group.artist,
      difficulty: group.difficulty, stepsheet: group.stepsheet,
      duration_ms: group.duration_ms, notes: '',
    });
    mutateRequests();
  }

  async function handlePanelRequestSwap(group, swap) {
    if (!clientId) return;
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
  }

  async function handlePanelRemove(requestId) {
    await fetch(`/api/dj/requests/${requestId}`, { method: 'DELETE' });
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

  function DirectTipSection() {
    if (!djId || !tippingEnabled) return null;
    const PRESETS = [100, 200, 500, 1000];
    const tipCents = directTipCents === 'custom'
      ? Math.round(parseFloat(directTipCustom || '0') * 100)
      : directTipCents;
    const fee = tipCents >= 100 ? Math.ceil(tipCents * 0.029 + 30) : 0;
    const canSend = tipCents >= 100 && !directTipping;
    return (
      <div className={styles.directTipSection}>
        <p className={styles.directTipLabel}>Tip the DJ</p>
        <div className={styles.directTipPresets}>
          {PRESETS.map(c => (
            <button
              key={c}
              className={`${styles.directTipChip} ${directTipCents === c ? styles.directTipChipActive : ''}`}
              onClick={() => { setDirectTipCents(c); setDirectTipCustom(''); }}
            >
              ${c / 100}
            </button>
          ))}
          <button
            className={`${styles.directTipChip} ${directTipCents === 'custom' ? styles.directTipChipActive : ''}`}
            onClick={() => setDirectTipCents('custom')}
          >
            Custom
          </button>
        </div>
        {directTipCents === 'custom' && (
          <div className={styles.directTipCustomWrap}>
            <span className={styles.directTipDollar}>$</span>
            <input
              className={styles.directTipCustomInput}
              type="number" min="1" step="1" placeholder="0"
              value={directTipCustom}
              onChange={e => setDirectTipCustom(e.target.value)}
              autoFocus
            />
          </div>
        )}
        {tipCents >= 100 && (
          <p className={styles.directTipFee}>
            You pay ${((tipCents + fee) / 100).toFixed(2)} · DJ receives ${(tipCents / 100).toFixed(2)}
          </p>
        )}
        <button className={styles.directTipBtn} onClick={sendDirectTip} disabled={!canSend}>
          {directTipping ? 'Redirecting…' : 'Tip the DJ'}
        </button>
      </div>
    );
  }

  if (sessionChecked && !sessionActive) {
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
                <DirectTipSection />
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
                  placeholder={localClientId}
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
                        <span className={styles.beatBalance}>{beatBalance} Beats</span>
                        <button className={styles.accountBarBtn} onClick={() => setShowBeatShop(v => !v)}>
                          {showBeatShop ? 'Close' : 'Buy Beats'}
                        </button>
                      </div>
                    )}
                  </div>

                  {tippingEnabled && showBeatShop && (
                    <div className={styles.beatShop}>
                      {BEAT_PACKAGES.map(pkg => (
                        <button
                          key={pkg.id}
                          className={`${styles.beatPkg} ${pkg.featured ? styles.beatPkgFeatured : ''}`}
                          onClick={() => buyBeats(pkg)}
                          disabled={buyingPackage === pkg.id}
                        >
                          <span className={styles.beatPkgLabel}>{pkg.label}{pkg.featured ? ' ⭐' : ''}</span>
                          <span className={styles.beatPkgBeats}>
                            {pkg.base} <span className={styles.beatPkgBonus}>+{pkg.bonus}</span> Beats
                          </span>
                          <span className={styles.beatPkgPrice}>
                            ${(pkg.priceCents / 100).toFixed(2)}
                          </span>
                        </button>
                      ))}
                      <p className={styles.beatShopDisclaimer}>
                        Beats increase the likelihood your request gets played — they do not guarantee it.
                      </p>
                    </div>
                  )}
                </>
              ) : tippingEnabled ? (
                <div className={styles.beatsSignInPrompt}>
                  <p className={styles.beatsSignInHeading}>Tip with Beats to boost your request</p>
                  <p className={styles.beatsSignInSub}>Sign in to buy Beats and increase the chances your dance gets played.</p>
                  <button
                    className={styles.beatsSignInBtn}
                    onClick={() => signIn('ldco', { callbackUrl: window.location.href })}
                  >
                    Sign in to buy Beats
                  </button>
                </div>
              ) : null}
            </div>
          )}

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
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Song name"
                  value={swapSongName}
                  onChange={e => setSwapSongName(e.target.value)}
                  maxLength={100}
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

          {/* ── Direct tip ── */}
          <DirectTipSection />
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
            {activeTab === 'requests' && (
              requestGroups.length === 0 ? (
                <p className={styles.tabEmpty}>No active requests yet.</p>
              ) : requestGroups.map(group => {
                const myOriginal = group.originals.find(r => r.clientId === clientId);
                const totalOriginals = group.originals.length;
                return (
                  <div key={group.danceKey} className={styles.tabGroup}>
                    {/* Dance name header */}
                    <div className={styles.tabGroupName}>{group.danceName}</div>

                    {/* Original version row (only if anyone requested it) */}
                    {totalOriginals > 0 && (
                      <>
                        <div className={styles.tabRow}>
                          <div className={styles.tabRowInfo}>
                            {group.songName && (
                              <span className={styles.tabRowSong}>
                                {group.songName}{group.artist ? ` — ${group.artist}` : ''}
                              </span>
                            )}
                          </div>
                          <div className={styles.tabRowActions}>
                            {myOriginal ? (
                              <>
                                {tippingEnabled && isSignedIn && (() => {
                                  const existingBeats = Math.round((myOriginal.tipCents ?? 0) / 5);
                                  const pendingBeats = quickTipDisplay?.id === myOriginal._id ? quickTipDisplay.count : 0;
                                  const displayBeats = existingBeats + pendingBeats;
                                  const hasTip = displayBeats > 0;
                                  const isOpen = boosterOpenId === myOriginal._id;
                                  return (
                                    <div className={`${styles.splitBoostWrap} ${hasTip ? styles.splitBoostWrapTipped : ''} ${isOpen ? styles.splitBoostWrapOpen : ''}`}>
                                      <button
                                        className={`${styles.splitBtnLeft} ${hasTip ? styles.splitBtnLeftTipped : ''} ${pendingBeats > 0 ? styles.splitBtnLeftPending : ''}`}
                                        onClick={() => setBoosterOpenId(isOpen ? null : myOriginal._id)}
                                        disabled={beatBalance === 0}
                                        title="Boost options"
                                      >
                                        ♫{hasTip ? ` ${displayBeats}` : ''}
                                      </button>
                                      <button
                                        className={styles.splitBtnRight}
                                        onClick={() => handleQuickBoost(myOriginal)}
                                        disabled={beatBalance === 0}
                                        title="+1 Beat"
                                      >
                                        +
                                      </button>
                                    </div>
                                  );
                                })()}
                                <span className={styles.reqCount}>{totalOriginals}</span>
                                <button className={styles.minusBtn} onClick={() => requestRemoveClick(myOriginal, totalOriginals === 1)} title="Remove your request">−</button>
                              </>
                            ) : (
                              <>
                                <span className={styles.reqCount}>{totalOriginals}</span>
                                <button className={styles.plusBtn} onClick={() => handlePanelRequest(group)} title="Add your request">+</button>
                              </>
                            )}
                          </div>
                        </div>
                        {boosterOpenId === myOriginal?._id && (
                          <BeatBooster
                            balance={beatBalance}
                            onTip={async (beats) => { await tipRequest(myOriginal._id, beats); setBoosterOpenId(null); }}
                            onClose={() => setBoosterOpenId(null)}
                          />
                        )}
                        {pendingRemoveId === myOriginal?._id && (() => {
                          const hasTip = (myOriginal.tipCents ?? 0) > 0;
                          const isLast = totalOriginals === 1;
                          return (
                            <div className={styles.removeWarning}>
                              {isLast && <p className={styles.removeWarningText}>You are the last person requesting this dance — removing it will remove it from the list for everyone.</p>}
                              {hasTip && <p className={styles.removeWarningText}>You have spent {Math.round(myOriginal.tipCents / 5)} Beats on this request that will not be refunded.</p>}
                              <div className={styles.removeWarningActions}>
                                <button className={styles.removeWarningCancel} onClick={() => setPendingRemoveId(null)}>Keep request</button>
                                <button className={styles.removeWarningConfirm} onClick={() => handlePanelRemove(myOriginal._id)}>Remove</button>
                              </div>
                            </div>
                          );
                        })()}
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
                            </div>
                            <div className={styles.tabRowActions}>
                              {mySwap ? (
                                <>
                                  {tippingEnabled && isSignedIn && (() => {
                                    const existingBeats = Math.round((mySwap.tipCents ?? 0) / 5);
                                    const pendingBeats = quickTipDisplay?.id === mySwap._id ? quickTipDisplay.count : 0;
                                    const displayBeats = existingBeats + pendingBeats;
                                    const hasTip = displayBeats > 0;
                                    const isOpen = boosterOpenId === mySwap._id;
                                    return (
                                      <div className={`${styles.splitBoostWrap} ${hasTip ? styles.splitBoostWrapTipped : ''} ${isOpen ? styles.splitBoostWrapOpen : ''}`}>
                                        <button
                                          className={`${styles.splitBtnLeft} ${hasTip ? styles.splitBtnLeftTipped : ''} ${pendingBeats > 0 ? styles.splitBtnLeftPending : ''}`}
                                          onClick={() => setBoosterOpenId(isOpen ? null : mySwap._id)}
                                          disabled={beatBalance === 0}
                                          title="Boost options"
                                        >
                                          ♫{hasTip ? ` ${displayBeats}` : ''}
                                        </button>
                                        <button
                                          className={styles.splitBtnRight}
                                          onClick={() => handleQuickBoost(mySwap)}
                                          disabled={beatBalance === 0}
                                          title="+1 Beat"
                                        >
                                          +
                                        </button>
                                      </div>
                                    );
                                  })()}
                                  <span className={styles.reqCount}>{swap.requests.length}</span>
                                  <button className={styles.minusBtn} onClick={() => requestRemoveClick(mySwap, swap.requests.length === 1)} title="Remove your request">−</button>
                                </>
                              ) : (
                                <>
                                  <span className={styles.reqCount}>{swap.requests.length}</span>
                                  <button className={styles.plusBtn} onClick={() => handlePanelRequestSwap(group, swap)} title="Support this song swap">+</button>
                                </>
                              )}
                            </div>
                          </div>
                          {boosterOpenId === mySwap?._id && (
                            <BeatBooster
                              balance={beatBalance}
                              onTip={async (beats) => { await tipRequest(mySwap._id, beats); setBoosterOpenId(null); }}
                              onClose={() => setBoosterOpenId(null)}
                            />
                          )}
                          {pendingRemoveId === mySwap?._id && (() => {
                            const hasTip = (mySwap.tipCents ?? 0) > 0;
                            const isLast = swap.requests.length === 1;
                            return (
                              <div className={styles.removeWarning}>
                                {isLast && <p className={styles.removeWarningText}>You are the last person requesting this song swap — removing it will remove it from the list for everyone.</p>}
                                {hasTip && <p className={styles.removeWarningText}>You have spent {Math.round(mySwap.tipCents / 5)} Beats on this request that will not be refunded.</p>}
                                <div className={styles.removeWarningActions}>
                                  <button className={styles.removeWarningCancel} onClick={() => setPendingRemoveId(null)}>Keep request</button>
                                  <button className={styles.removeWarningConfirm} onClick={() => handlePanelRemove(mySwap._id)}>Remove</button>
                                </div>
                              </div>
                            );
                          })()}
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
    </>
  );
}
