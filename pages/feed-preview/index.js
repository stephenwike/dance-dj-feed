import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import feedStyles from '../dj-feed/dj-feed.module.css';
import { DEFAULT_TEMPLATE } from '../../lib/client/dj/feedTemplates';

const QRCodeSVG = dynamic(() => import('qrcode.react').then(m => m.QRCodeSVG), { ssr: false });

const fetcher = url => fetch(url).then(r => r.json());

const DIFF_COLORS = {
  beginner: '#22c55e', improver: '#3b82f6',
  intermediate: '#f59e0b', advanced: '#ef4444',
};
function diffColor(d = '') {
  const key = Object.keys(DIFF_COLORS).find(k => d.toLowerCase().includes(k));
  return key ? DIFF_COLORS[key] : '#8A5CFF';
}
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
function formatTime(ms_offset) {
  const d = new Date(Date.now() + ms_offset);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function makeBeatsFor(requests) {
  const map = {};
  for (const r of requests) {
    if (!['pending', 'approved', 'playing'].includes(r.status)) continue;
    if (r.danceType === 'message') continue;
    const key = r.danceType === 'partner'
      ? (r.partnerGroupId || r._id)
      : (r.danceId || (r.danceName || '').toLowerCase().trim());
    map[key] = (map[key] ?? 0) + Math.round((r.tipCents ?? 0) / 5);
  }
  return (r) => {
    if (r.danceType === 'partner') return map[r.partnerGroupId || r._id] ?? 0;
    return map[r.danceId || (r.danceName || '').toLowerCase().trim()] ?? 0;
  };
}

// ── Element renderers ──────────────────────────────────────────────

function MainFeedEl({ requests, requestUrl = '' }) {
  const beatsFor = useMemo(() => makeBeatsFor(requests), [requests]);

  const playing = requests.find(r => r.status === 'playing') ?? null;
  const upcoming = requests
    .filter(r => r.status === 'approved')
    .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))
    .slice(0, 4);

  return (
    <div style={{
      width: '100%', height: '100%', display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
      overflow: 'hidden', boxSizing: 'border-box',
    }}>
      {/* Left: QR + steps */}
      <div className={feedStyles.left} style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}>
        <h1 className={feedStyles.title}>Request a Dance</h1>
        <div className={feedStyles.qrWrap}>
          {requestUrl
            ? <QRCodeSVG value={requestUrl} size={160} bgColor="#ffffff" fgColor="#1a1033" level="M" />
            : <div className={feedStyles.qrPlaceholder} style={{ width: 160, height: 160 }} />}
        </div>
        <p className={feedStyles.urlHint}>{requestUrl}</p>
        <ol className={feedStyles.steps}>
          <li><span className={feedStyles.stepNum}>1</span><span>Scan the QR code</span></li>
          <li><span className={feedStyles.stepNum}>2</span><span>Search for a dance</span></li>
          <li><span className={feedStyles.stepNum}>3</span><span>Submit your request!</span></li>
        </ol>
      </div>
      {/* Right: now playing + queue */}
      <div className={feedStyles.right} style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}>
        {!playing && upcoming.length === 0 ? (
          <div className={feedStyles.feedEmpty}>
            <span className={feedStyles.feedEmptyTitle}>No requests yet</span>
            <span className={feedStyles.feedEmptyHint}>Scan the QR code to request a dance</span>
          </div>
        ) : (
          <>
            {playing && <NowPlayingCard request={playing} beatsFor={beatsFor} />}
            {upcoming.length > 0 && <UpNextList items={upcoming} playing={playing} beatsFor={beatsFor} />}
          </>
        )}
      </div>
    </div>
  );
}

function RequestCtaEl({ requestUrl = '' }) {

  return (
    <div className={feedStyles.left} style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}>
      <h1 className={feedStyles.title}>Request a Dance</h1>
      <div className={feedStyles.qrWrap}>
        {requestUrl
          ? <QRCodeSVG value={requestUrl} size={180} bgColor="#ffffff" fgColor="#1a1033" level="M" />
          : <div className={feedStyles.qrPlaceholder} style={{ width: 180, height: 180 }} />}
      </div>
      <p className={feedStyles.urlHint}>{requestUrl}</p>
      <ol className={feedStyles.steps}>
        <li><span className={feedStyles.stepNum}>1</span><span>Scan the QR code with your phone</span></li>
        <li><span className={feedStyles.stepNum}>2</span><span>Search for a dance you&apos;d like to see</span></li>
        <li><span className={feedStyles.stepNum}>3</span><span>Submit your request!</span></li>
      </ol>
    </div>
  );
}

function FeedPanelEl({ requests }) {
  const beatsFor = useMemo(() => makeBeatsFor(requests), [requests]);
  const playing = requests.find(r => r.status === 'playing') ?? null;
  const upcoming = requests
    .filter(r => r.status === 'approved')
    .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))
    .slice(0, 4);

  return (
    <div className={feedStyles.right} style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}>
      {!playing && upcoming.length === 0 ? (
        <div className={feedStyles.feedEmpty}>
          <span className={feedStyles.feedEmptyTitle}>No requests yet</span>
          <span className={feedStyles.feedEmptyHint}>Scan the QR code to request a dance</span>
        </div>
      ) : (
        <>
          {playing && <NowPlayingCard request={playing} beatsFor={beatsFor} />}
          {upcoming.length > 0 && <UpNextList items={upcoming} playing={playing} beatsFor={beatsFor} />}
        </>
      )}
    </div>
  );
}

function NowPlayingEl({ requests }) {
  const beatsFor = useMemo(() => makeBeatsFor(requests), [requests]);
  const playing = requests.find(r => r.status === 'playing') ?? null;
  if (!playing) {
    return (
      <div className={feedStyles.right} style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}>
        <div className={feedStyles.feedEmpty}>
          <span className={feedStyles.feedEmptyTitle}>Nothing playing</span>
        </div>
      </div>
    );
  }
  return (
    <div className={feedStyles.right} style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}>
      <NowPlayingCard request={playing} beatsFor={beatsFor} />
    </div>
  );
}

function QueueListEl({ requests }) {
  const beatsFor = useMemo(() => makeBeatsFor(requests), [requests]);
  const playing = requests.find(r => r.status === 'playing') ?? null;
  const upcoming = requests
    .filter(r => r.status === 'approved')
    .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))
    .slice(0, 6);
  if (upcoming.length === 0) {
    return (
      <div className={feedStyles.right} style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}>
        <div className={feedStyles.feedEmpty}>
          <span className={feedStyles.feedEmptyTitle}>Queue is empty</span>
        </div>
      </div>
    );
  }
  return (
    <div className={feedStyles.right} style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}>
      <UpNextList items={upcoming} playing={playing} beatsFor={beatsFor} />
    </div>
  );
}

function MessageBannerEl({ message }) {
  if (!message) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(251,191,36,0.06)',
        color: 'rgba(251,191,36,0.35)', fontSize: 'clamp(0.8rem, 1.5vw, 1.1rem)', fontStyle: 'italic',
      }}>
        No active message
      </div>
    );
  }
  return (
    <div className={feedStyles.messageBanner} style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}>
      <div className={feedStyles.messageText}>{message.text}</div>
    </div>
  );
}

function PaymentLinksEl({ paymentLinks = [] }) {
  if (paymentLinks.length === 0) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.18)', fontSize: 'clamp(0.8rem, 1.5vw, 1rem)', fontStyle: 'italic',
      }}>
        No payment links configured
      </div>
    );
  }
  return (
    <div className={feedStyles.paymentSection} style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}>
      <p className={feedStyles.paymentTitle}>Tip the DJ</p>
      <div className={feedStyles.paymentLinks}>
        {paymentLinks.map((link, i) => (
          <div key={i} className={feedStyles.paymentLink}>
            <div className={feedStyles.paymentQrWrap}>
              <QRCodeSVG value={link.url} size={100} bgColor="#ffffff" fgColor="#1a1033" level="M" />
            </div>
            <span className={feedStyles.paymentLabel}>{link.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function NowPlayingCard({ request, beatsFor }) {
  const [progress, setProgress] = useState(100);
  const isPaused = !!request.pausedAt;
  const isPartner = request.danceType === 'partner';
  const dc = isPartner ? null : request.difficulty ? diffColor(request.difficulty) : '#8A5CFF';
  const beats = beatsFor(request);

  useEffect(() => {
    if (!request.playStartedAt) { setProgress(100); return; }
    const total = request.duration_ms ?? 180000;
    const update = () => {
      const ref = isPaused ? new Date(request.pausedAt) : new Date();
      const elapsed = ref - new Date(request.playStartedAt);
      setProgress(Math.max(0, 100 - (elapsed / total) * 100));
    };
    update();
    if (isPaused) return;
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [request._id, request.playStartedAt, request.pausedAt, request.duration_ms, isPaused]);

  return (
    <div
      className={feedStyles.queueItemPlaying}
      style={dc ? {
        borderLeftColor: dc, borderLeftWidth: '6px',
        background: `rgba(${hexToRgb(dc)}, 0.18)`,
        boxShadow: `inset 4px 0 32px rgba(${hexToRgb(dc)}, 0.12), 0 0 40px rgba(${hexToRgb(dc)}, 0.08)`,
      } : {
        borderLeftColor: 'rgba(255,255,255,0.35)', borderLeftWidth: '6px',
        background: 'rgba(255,255,255,0.04)',
        boxShadow: 'inset 4px 0 24px rgba(255,255,255,0.04)',
      }}
    >
      <div className={feedStyles.playingTop}>
        <div className={feedStyles.playingLabel}>
          <span
            className={feedStyles.playingDot}
            style={dc ? { background: dc, boxShadow: `0 0 0 0 ${dc}99` } : { background: 'rgba(255,255,255,0.7)' }}
            aria-label="Playing"
          />
          <span className={feedStyles.statusLabel}>Playing</span>
        </div>
        <div className={feedStyles.playingBadges}>
          {isPartner && <span className={feedStyles.partnerBadge}>👫 Partner{request.partnerStyle ? ` — ${request.partnerStyle}` : ' Dance'}</span>}
          {request.isSongSwap && <span className={feedStyles.swapChip}>↻ Song Swap</span>}
        </div>
      </div>
      <div className={feedStyles.playingMain}>
        {beats > 0 && (
          <span className={feedStyles.beatsCoinLg} aria-label={`${beats} beats`}>{beats}</span>
        )}
        <div className={feedStyles.queueDancePlaying}>
          {isPartner ? (request.songName || request.danceName) : request.danceName}
        </div>
      </div>
      {isPartner && request.artist && (
        <div className={feedStyles.partnerArtistLine}>
          <span className={feedStyles.partnerArtist}>{request.artist}</span>
        </div>
      )}
      {request.isSongSwap && request.swapSongName && (
        <div className={feedStyles.swapSongLine}>
          <span className={feedStyles.swapArrow}>↪</span>
          <span className={feedStyles.swapSongName}>{request.swapSongName}</span>
          {request.swapArtist && <span className={feedStyles.swapSongArtist}>{request.swapArtist}</span>}
        </div>
      )}
      {request.playStartedAt && (
        <div className={feedStyles.progressBar}>
          <div className={feedStyles.progressFill} style={{ width: `${progress}%`, background: dc ?? 'rgba(255,255,255,0.45)' }} />
        </div>
      )}
    </div>
  );
}

function UpNextList({ items, playing, beatsFor }) {
  const upcomingWithTimes = useMemo(() => {
    let cumMs = playing?.duration_ms ?? 180000;
    return items.map((r, idx) => {
      const startTime = playing ? formatTime(cumMs) : null;
      cumMs += r.duration_ms ?? 180000;
      return { ...r, startTime, num: idx + 1 };
    });
  }, [items, playing]);

  return (
    <>
      <div className={feedStyles.upNextHeader}>
        <span className={feedStyles.upNextDot} />
        <span className={feedStyles.statusLabel}>Up Next</span>
      </div>
      <ol className={feedStyles.queueList}>
        {upcomingWithTimes.map(r => {
          const beats = beatsFor(r);
          const isPartner = r.danceType === 'partner';
          return (
            <li key={r._id} className={`${feedStyles.queueItem}${r.isSongSwap ? ` ${feedStyles.queueItemSwap}` : ''}${r.danceType === 'message' ? ` ${feedStyles.queueItemMsg}` : ''}`}>
              <span className={feedStyles.queueNum}>{r.danceType === 'message' ? '💬' : r.num}</span>
              <span className={feedStyles.queueDanceCol}>
                <span className={feedStyles.queueDanceRow}>
                  {beats > 0 && (
                    <span className={feedStyles.beatsCoinSm} aria-label={`${beats} beats`}>{beats}</span>
                  )}
                  <span className={feedStyles.queueDance}>
                    {isPartner ? (r.songName || r.danceName) : r.danceName}
                  </span>
                </span>
                {r.isSongSwap && r.swapSongName && <span className={feedStyles.queueSwapRow}>↪ {r.swapSongName}</span>}
                {isPartner && r.artist && <span className={feedStyles.queuePartnerRow}>{r.artist}</span>}
              </span>
              <div className={feedStyles.queueRight}>
                {r.danceType !== 'message' && r.startTime && <span className={feedStyles.queueTime}>{r.startTime}</span>}
                {r.danceType === 'message' ? null
                  : isPartner ? (
                    <span className={feedStyles.diffPip} style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)' }}>
                      {r.partnerStyle || 'Partner'}
                    </span>
                  ) : r.difficulty ? (
                    <span className={feedStyles.diffPip} style={{ background: diffColor(r.difficulty) }}>{r.difficulty}</span>
                  ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

// ── Beats advertisement ────────────────────────────────────────────

const MOCK_AD_ITEMS = [
  { id: 'es', name: 'Electric Slide',       sub: 'Intermediate', baseBeats: 4, hero: false },
  { id: 'bs', name: "Boot Scootin' Boogie", sub: 'Beginner',     baseBeats: 2, hero: false },
  { id: 'cs', name: 'Cupid Shuffle',        sub: 'Beginner',     baseBeats: 1, hero: false },
  { id: 'wc', name: 'Watermelon Crawl',     sub: 'Improver',     baseBeats: 0, hero: true  },
];

function getAdDanceName(r) {
  return r.danceType === 'partner' ? (r.songName || r.danceName || 'Partner Dance') : (r.danceName || 'Dance');
}
function getAdDanceSub(r) {
  return r.danceType === 'partner' ? (r.partnerStyle || 'Partner') : (r.difficulty || 'Mixed');
}

// Compute order-change sequence as hero beats increase from 0 through non-hero items
function computeAdOrders(items) {
  const hero = items.find(x => x.hero);
  // Start: non-hero sorted by beats ascending (queue order), hero at the bottom.
  // This gives [2,3,4,1]. Hero then rises past each item from top-of-stack downward,
  // ending at [1,2,3,4].
  const nonHero = items.filter(x => !x.hero).sort((a, b) => a.baseBeats - b.baseBeats);
  const initial = [...nonHero.map(x => x.id), hero.id];
  const orders = [initial];
  const working = [...initial];
  // Targets in reverse order (highest beats first = item directly above hero first)
  for (const target of [...nonHero].reverse()) {
    const heroIdx = working.indexOf(hero.id);
    const targetIdx = working.indexOf(target.id);
    if (heroIdx <= targetIdx) continue;
    working.splice(heroIdx, 1);
    working.splice(working.indexOf(target.id), 0, hero.id);
    orders.push([...working]);
  }
  return orders;
}

// Build 4 display slots from real queue + mock fallback.
// Slot layout: [0]=top/4beats, [3]=bottom/hero/0beats
// Queue mapping: 1st in queue → slot[3] (hero), 4th → slot[0] (top)
function buildAdDisplayItems(requests) {
  const approved = requests
    .filter(r => r.status === 'approved')
    .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))
    .slice(0, 4);
  const slots = [null, null, null, null];
  approved.forEach((r, i) => {
    const slot = 3 - i; // 1st → slot 3, 2nd → slot 2, 3rd → slot 1, 4th → slot 0
    slots[slot] = {
      id: String(r._id),
      name: getAdDanceName(r),
      sub: getAdDanceSub(r),
      baseBeats: MOCK_AD_ITEMS[slot].baseBeats,
      hero: slot === 3,
    };
  });
  return slots.map((item, i) => item ?? MOCK_AD_ITEMS[i]);
}

function AdNowPlayingCard({ playing }) {
  const [progress, setProgress] = useState(100);
  const isPaused = !!playing?.pausedAt;
  const name = playing ? getAdDanceName(playing) : 'Cha Cha Slide';
  const sub  = playing ? getAdDanceSub(playing)  : 'Beginner';

  useEffect(() => {
    if (!playing?.playStartedAt) { setProgress(100); return; }
    const total = playing.duration_ms ?? 180000;
    const update = () => {
      const ref = isPaused ? new Date(playing.pausedAt) : new Date();
      const elapsed = ref - new Date(playing.playStartedAt);
      setProgress(Math.max(0, 100 - (elapsed / total) * 100));
    };
    update();
    if (isPaused) return;
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [playing?._id, playing?.playStartedAt, playing?.pausedAt, playing?.duration_ms, isPaused]);

  return (
    <div style={{
      borderRadius: 'clamp(10px, 1.4vw, 18px)',
      borderLeft: '6px solid #22c55e',
      background: 'rgba(34,197,94,0.1)',
      boxShadow: 'inset 4px 0 32px rgba(34,197,94,0.1), 0 0 40px rgba(34,197,94,0.06)',
      padding: '1.6vh 2vw',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1vw', marginBottom: '0.6vh' }}>
        <span style={{
          width: 'clamp(7px, 0.8vw, 12px)', height: 'clamp(7px, 0.8vw, 12px)',
          borderRadius: '50%', background: '#22c55e', flexShrink: 0,
          animation: 'ba-dot-blink 2.8s ease-in-out infinite',
        }} />
        <span style={{ fontSize: 'clamp(0.6rem, 0.85vw, 1rem)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.13em', color: '#22c55e' }}>
          Now Playing
        </span>
      </div>
      <div style={{ fontSize: 'clamp(1rem, 2.2vw, 3rem)', fontWeight: 800, color: '#F5F2E8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.1 }}>
        {name}
      </div>
      <div style={{ fontSize: 'clamp(0.65rem, 1.1vw, 1.4rem)', color: 'rgba(245,242,232,0.35)', marginTop: '0.4vh' }}>
        {sub}
      </div>
      {playing?.playStartedAt && (
        <div style={{ height: 'clamp(3px, 0.4vh, 5px)', background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden', marginTop: '1.2vh' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: '#22c55e', borderRadius: 99, transition: 'width 1s linear' }} />
        </div>
      )}
    </div>
  );
}

function BeatsAdEl({ requests = [] }) {
  const playing = requests.find(r => r.status === 'playing') ?? null;

  const displayItems = useMemo(() => buildAdDisplayItems(requests), [requests]);
  const adOrders = useMemo(() => computeAdOrders(displayItems), [displayItems]);

  const [order, setOrder] = useState(() => adOrders[0]);
  const [heroState, setHeroState] = useState('idle'); // idle | ticking | jumped

  const [activeDisplayItems, setActiveDisplayItems] = useState(displayItems);

  const timers                = useRef([]);
  const rafId                 = useRef(null);
  const flipData              = useRef(null);
  const heroBeatsRef          = useRef(0);
  const displayItemsRef       = useRef(displayItems);
  const adOrdersRef           = useRef(adOrders);
  const heroIdRef             = useRef(displayItems.find(x => x.hero)?.id ?? 'wc');
  const activeDisplayItemsRef = useRef(displayItems);

  // Keep pending-data refs fresh so the next run() reads the latest queue state.
  // activeDisplayItemsRef and heroIdRef are NOT synced live — they're snapshotted
  // at the start of each run() so queue changes can't break an in-progress animation.
  useEffect(() => { displayItemsRef.current = displayItems; }, [displayItems]);
  useEffect(() => { adOrdersRef.current = adOrders; }, [adOrders]);

  // ── FLIP animation: fires after each render, applies if flipData is set ──
  useLayoutEffect(() => {
    if (!flipData.current) return;
    const { oldTops, newOrder } = flipData.current;
    flipData.current = null;
    newOrder.forEach(id => {
      const el = document.getElementById('ba-qi-' + id);
      if (!el || oldTops[id] === undefined) return;
      const delta = oldTops[id] - el.getBoundingClientRect().top;
      if (Math.abs(delta) < 0.5) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transition = 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.transform = '';
      }));
    });
  });

  useEffect(() => {
    function addTimer(fn, ms) {
      const id = setTimeout(fn, ms);
      timers.current.push(id);
    }

    function tickBeats(from, to, ms, onDone) {
      const start = performance.now();
      function frame(now) {
        const t = Math.min((now - start) / ms, 1);
        const beats = Math.round(from + (to - from) * t);
        heroBeatsRef.current = beats;
        const el = document.getElementById('ba-bc-' + heroIdRef.current);
        if (el) el.textContent = beats;
        if (t < 1) { rafId.current = requestAnimationFrame(frame); }
        else { onDone(); }
      }
      rafId.current = requestAnimationFrame(frame);
    }

    function flipTo(newOrder, nextHeroState) {
      const oldTops = {};
      activeDisplayItemsRef.current.forEach(d => {
        const el = document.getElementById('ba-qi-' + d.id);
        if (el) oldTops[d.id] = el.getBoundingClientRect().top;
      });
      flipData.current = { oldTops, newOrder };
      setOrder(newOrder);
      setHeroState(nextHeroState);
    }

    function run() {
      // Snapshot data at the start of this run — frozen for the entire animation cycle.
      const items  = displayItemsRef.current;
      const orders = adOrdersRef.current;
      const heroId = items.find(x => x.hero)?.id ?? 'wc';

      heroIdRef.current             = heroId;
      activeDisplayItemsRef.current = items;
      setActiveDisplayItems(items);

      heroBeatsRef.current = 0;
      setOrder(orders[0]);
      setHeroState('idle');
      const bc = document.getElementById('ba-bc-' + heroId);
      if (bc) bc.textContent = '0';

      addTimer(() => {
        setHeroState('ticking');
        tickBeats(0, 1, 1200, () => {
          flipTo(orders[1] ?? orders[0], 'jumped');
          addTimer(() => {
            setHeroState('ticking');
            tickBeats(1, 2, 1000, () => {
              flipTo(orders[2] ?? orders[1] ?? orders[0], 'jumped');
              addTimer(() => {
                setHeroState('ticking');
                tickBeats(2, 5, 2200, () => {
                  flipTo(orders[3] ?? orders[2] ?? orders[1] ?? orders[0], 'jumped');
                });
              }, 320);
            });
          }, 340);
        });
      }, 1600);
    }

    addTimer(run, 700);

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  const coin = (size, opacity = 1) => ({
    display: 'inline-block',
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    background: 'url(/beats/coin.gif) center/cover no-repeat, radial-gradient(circle at 38% 32%, #FFE566, #9A5A04)',
    opacity,
  });

  return (
    <div style={{
      width: '100%', height: '100%', overflow: 'hidden',
      background: '#07071a', boxSizing: 'border-box',
      display: 'grid',
      gridTemplateColumns: '5fr 6fr',
      gridTemplateAreas: '"msg viz"',
      alignItems: 'stretch',
      padding: '3.5vh 3.5vw',
      gap: '3vw',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      WebkitFontSmoothing: 'antialiased',
      position: 'relative',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background:
          'radial-gradient(ellipse 55% 60% at 18% 50%, rgba(244,169,22,0.055) 0%, transparent 60%),' +
          'radial-gradient(ellipse 50% 70% at 82% 50%, rgba(100,80,200,0.04) 0%, transparent 60%)',
      }} />

      {/* ── Left: Message ── */}
      <div style={{ gridArea: 'msg', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '3.5vh', position: 'relative', zIndex: 1 }}>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.4vw' }}>
          <div style={{ ...coin('clamp(48px, 5.5vw, 90px)'), boxShadow: '0 4px 20px rgba(200,148,10,0.5)', animation: 'ba-coin-glow 3s ease-in-out infinite' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <img
              src="/beats/beat_text.png" alt="beats"
              style={{ height: 'clamp(22px, 2.8vw, 48px)', width: 'auto', objectFit: 'contain', objectPosition: 'left', display: 'block' }}
              onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
            />
            <span style={{ display: 'none', fontSize: 'clamp(1.4rem, 2.6vw, 4rem)', fontWeight: 900, letterSpacing: '0.04em', color: '#F4A916', textTransform: 'lowercase' }}>beats</span>
            <span style={{ fontSize: 'clamp(0.65rem, 1vw, 1.2rem)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(245,242,232,0.28)', marginTop: 4 }}>DJ Tips</span>
          </div>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: 'clamp(2.6rem, 7vw, 8.5rem)', fontWeight: 900, lineHeight: 1.04, letterSpacing: '-0.03em', color: '#F5F2E8', margin: 0 }}>
          Every Beat<br /><span style={{ color: '#FFCC44' }}>counts</span>
        </h1>

        {/* Body */}
        <p style={{ fontSize: 'clamp(1rem, 2.2vw, 2.8rem)', fontWeight: 500, lineHeight: 1.5, color: 'rgba(245,242,232,0.6)', margin: 0 }}>
          Tip any dance request — even a single Beat pushes it higher in the queue and closer to being played.
        </p>

        {/* CTA */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '1vw', alignSelf: 'flex-start',
          background: 'rgba(244,169,22,0.13)', border: '1.5px solid rgba(244,169,22,0.32)',
          borderRadius: '100px', padding: '1.2vh 2.5vw',
          fontSize: 'clamp(0.85rem, 1.8vw, 2.2rem)', fontWeight: 700, color: '#FFCC44',
          animation: 'ba-badge-pulse 2.8s ease-in-out infinite',
        }}>
          <span style={{ width: 'clamp(7px, 0.8vw, 12px)', height: 'clamp(7px, 0.8vw, 12px)', borderRadius: '50%', background: '#FFCC44', flexShrink: 0, animation: 'ba-dot-blink 2.8s ease-in-out infinite' }} />
          Sign in to use Beats
        </div>
      </div>

      {/* ── Right: Visual ── */}
      <div style={{ gridArea: 'viz', display: 'flex', flexDirection: 'column', gap: '1.8vh', justifyContent: 'center', position: 'relative', zIndex: 1 }}>

        {/* Now Playing card — mirrors the main feed NowPlayingCard style */}
        <AdNowPlayingCard playing={playing} />

        {/* Queue card */}
        <div style={{
          background: '#0d0d26', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 'clamp(10px, 1.4vw, 18px)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '1.2vh 2vw', borderBottom: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.018)', flexShrink: 0,
          }}>
            <span style={{ fontSize: 'clamp(0.65rem, 1vw, 1.3rem)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.13em', color: 'rgba(245,242,232,0.3)' }}>Requests</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5vw', fontSize: 'clamp(0.6rem, 0.9vw, 1.1rem)', fontWeight: 600, color: 'rgba(245,242,232,0.3)' }}>
              <span style={coin('clamp(12px, 1.3vw, 18px)')} />
              sorted by beats
            </span>
          </div>

          {/* Animated queue list */}
          <div id="ba-queue-list" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {order.map((id, idx) => {
              const d = activeDisplayItems.find(x => x.id === id);
              if (!d) return null;
              const ticking = d.hero && heroState === 'ticking';
              const jumped  = d.hero && heroState === 'jumped';
              const active  = ticking || jumped;
              const showArrow = d.hero && heroState !== 'idle';
              const isNext = idx === 0;
              return (
                <div
                  key={id}
                  id={'ba-qi-' + id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '1.4vw',
                    padding: '0 2vw', flex: 1,
                    borderBottom: idx < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    borderLeft: active ? `3px solid ${jumped ? '#F4A916' : 'rgba(244,169,22,0.4)'}` : '3px solid transparent',
                    background: jumped ? 'rgba(244,169,22,0.1)' : ticking ? 'rgba(244,169,22,0.06)' : 'transparent',
                    boxShadow: jumped ? '0 0 30px rgba(244,169,22,0.14)' : 'none',
                    transition: 'background 0.35s, border-color 0.35s, box-shadow 0.35s',
                    willChange: 'transform', position: 'relative',
                  }}
                >
                  {/* Position number */}
                  <span style={{
                    fontSize: 'clamp(1.4rem, 2.4vw, 3.5rem)', fontWeight: 800,
                    color: jumped ? '#FFCC44' : active ? '#F4A916' : 'rgba(245,242,232,0.3)',
                    width: 'clamp(28px, 3vw, 52px)', textAlign: 'center', flexShrink: 0,
                    transition: 'color 0.35s', fontVariantNumeric: 'tabular-nums',
                  }}>{idx + 1}</span>

                  {/* Dance info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 'clamp(1.3rem, 2.6vw, 4rem)', fontWeight: 700,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      color: active ? '#FFCC44' : '#F5F2E8', transition: 'color 0.35s',
                    }}>{d.name}</div>
                    <div style={{ fontSize: 'clamp(0.85rem, 1.4vw, 2rem)', color: 'rgba(245,242,232,0.3)', marginTop: '0.3vh' }}>{d.sub}</div>
                  </div>

                  {/* Beat chip */}
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: '0.6vw', flexShrink: 0,
                    fontSize: 'clamp(1.2rem, 2.2vw, 3.2rem)', fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    color: active ? '#FFCC44' : 'rgba(245,242,232,0.3)',
                    border: `1.5px solid ${active ? 'rgba(244,169,22,0.32)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '100px', padding: '0.5vh 1.2vw 0.5vh 0.8vw',
                    background: active ? 'rgba(244,169,22,0.13)' : 'transparent',
                    boxShadow: jumped ? '0 0 18px rgba(244,169,22,0.4)' : ticking ? '0 0 12px rgba(244,169,22,0.25)' : 'none',
                    transition: 'color 0.3s, background 0.3s, border-color 0.3s, box-shadow 0.3s',
                  }}>
                    <span style={{ ...coin('clamp(20px, 2.5vw, 40px)', active ? 1 : 0.35), boxShadow: jumped ? '0 0 10px rgba(244,169,22,0.65)' : 'none', transition: 'opacity 0.3s, box-shadow 0.3s' }} />
                    <span id={d.hero ? 'ba-bc-' + d.id : undefined}>{d.hero ? heroBeatsRef.current : d.baseBeats}</span>
                  </span>

                  {/* Up arrow */}
                  {showArrow && <span style={{ fontSize: 'clamp(1.2rem, 2.2vw, 3rem)', fontWeight: 900, color: '#FFCC44', flexShrink: 0, animation: 'ba-arrow-bob 0.9s ease-in-out infinite' }}>↑</span>}

                  {/* Up Next badge */}
                  {isNext && (
                    <span style={{
                      position: 'absolute', top: '0.5vh', right: 0,
                      fontSize: 'clamp(0.65rem, 1vw, 1.3rem)', fontWeight: 900,
                      textTransform: 'uppercase', letterSpacing: '0.1em',
                      color: '#F4A916', background: 'rgba(244,169,22,0.13)',
                      border: '1px solid rgba(244,169,22,0.32)', borderRight: 'none',
                      borderRadius: '4px 0 0 4px', padding: '2px 8px',
                    }}>Up Next</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ba-coin-glow {
          0%,100% { box-shadow: 0 4px 20px rgba(200,148,10,0.5); }
          50%      { box-shadow: 0 4px 36px rgba(244,169,22,0.85); }
        }
        @keyframes ba-badge-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(244,169,22,0); }
          50%      { box-shadow: 0 0 28px rgba(244,169,22,0.3); }
        }
        @keyframes ba-dot-blink { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes ba-bar  { to { height: 100%; } }
        @keyframes ba-arrow-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      `}</style>
    </div>
  );
}

// ── Image element ───────────────────────────────────────────────────

function ImageEl({ src, fit = 'contain', alt = '' }) {
  const [failed, setFailed] = useState(false);

  if (!src) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        color: 'rgba(255,255,255,0.2)', fontSize: 'clamp(0.7rem, 1.1vw, 0.9rem)',
      }}>
        <span style={{ fontSize: '2em' }}>🖼️</span>
        <span>No image URL set</span>
      </div>
    );
  }

  if (failed) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 10,
        color: 'rgba(255,255,255,0.35)', fontSize: 'clamp(0.65rem, 1vw, 0.85rem)',
        padding: '1em', textAlign: 'center',
      }}>
        <span style={{ fontSize: '2em' }}>⚠️</span>
        <span>Image failed to load.</span>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>
          The host may block hotlinking. Try imgur.com or postimages.org instead.
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }}
      onError={() => setFailed(true)}
    />
  );
}

// ── Placeholder for unsupported element types ──────────────────────

function PlaceholderEl({ type }) {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: 'rgba(255,255,255,0.18)',
      fontSize: 'clamp(0.75rem, 1.2vw, 0.95rem)', fontStyle: 'italic',
    }}>
      {type}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────

export default function FeedPreviewPage() {
  const { query, isReady } = useRouter();
  const { templateId: templateIdParam, sessionId } = query;

  // When no templateId is in the URL, poll the session for its current template
  // so the TV display auto-updates when the DJ changes the template in the controller.
  const useSessionLookup = isReady && !!sessionId && !templateIdParam;
  const { data: sessionDisplay } = useSWR(
    useSessionLookup ? `/api/dj/session-display?sessionId=${sessionId}` : null,
    fetcher,
    { refreshInterval: 8000 },
  );

  // URL param takes priority; otherwise use what the session reports
  const effectiveTemplateId = templateIdParam ?? (useSessionLookup ? (sessionDisplay?.feedTemplateId ?? null) : null);
  // Key that changes when the DJ clicks Apply — causes template to re-fetch even if the ID didn't change
  const feedAppliedAt = sessionDisplay?.feedAppliedAt ?? null;
  const templateFetchKey = `${effectiveTemplateId ?? ''}_${feedAppliedAt ?? ''}`;

  // QR code URL — must point to the slug-based route so getServerSideProps can resolve the session.
  const sessionSlug = sessionDisplay?.slug ?? null;
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const requestUrl = sessionSlug ? `${origin}/request/${sessionSlug}` : `${origin}/dj-request`;

  const [template, setTemplate] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    if (!isReady) return;
    // Still waiting for session lookup to resolve
    if (useSessionLookup && effectiveTemplateId === null) return;

    if (!effectiveTemplateId || effectiveTemplateId === 'default') {
      setTemplate(DEFAULT_TEMPLATE);
      setInitialLoading(false);
      return;
    }
    fetch(`/api/dj/feed-templates/${effectiveTemplateId}`)
      .then(r => r.ok ? r.json() : null)
      .then(t => {
        setTemplate(t ?? DEFAULT_TEMPLATE);
        setInitialLoading(false);
      })
      .catch(() => {
        setTemplate(DEFAULT_TEMPLATE);
        setInitialLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, templateFetchKey, useSessionLookup]);

  const requestsUrl = sessionId ? `/api/dj/requests?sessionId=${sessionId}` : null;
  const { data: requests = [] } = useSWR(requestsUrl, fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  });

  const messagesUrl = sessionId ? `/api/dj/messages?sessionId=${sessionId}` : '/api/dj/messages';
  const { data: msgData } = useSWR(messagesUrl, fetcher, { refreshInterval: 5000 });
  const activeMessage = (() => {
    const m = msgData?.message;
    if (!m) return null;
    if (m.expiresAt && new Date(m.expiresAt) <= new Date()) return null;
    return m;
  })();

  const [msgProgress, setMsgProgress] = useState(100);
  useEffect(() => {
    if (!activeMessage?.expiresAt) { setMsgProgress(100); return; }
    const total = activeMessage.duration * 1000;
    const update = () => {
      const remaining = new Date(activeMessage.expiresAt) - new Date();
      setMsgProgress(Math.max(0, (remaining / total) * 100));
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [activeMessage?._id, activeMessage?.expiresAt, activeMessage?.duration]);

  const { data: profileData } = useSWR('/api/dj/profile', fetcher);
  const paymentLinks = profileData?.paymentLinks ?? [];

  const [slideIdx, setSlideIdx] = useState(0);

  const slide = useMemo(() => {
    if (!template) return null;
    return template.slides[slideIdx % template.slides.length] ?? template.slides[0];
  }, [template, slideIdx]);

  // Slideshow rotation
  useEffect(() => {
    if (!template || template.slides.length <= 1) return;
    const durations = template.slides.map(s => (s.duration > 0 ? s.duration * 1000 : null));
    const current = durations[slideIdx % template.slides.length];
    if (!current) return;
    const t = setTimeout(() => setSlideIdx(i => i + 1), current);
    return () => clearTimeout(t);
  }, [template, slideIdx]);

  if (initialLoading || !slide) {
    return (
      <div style={{
        width: '100vw', height: '100vh', background: '#0e0e18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.3)', fontFamily: 'Montserrat, system-ui, sans-serif',
      }}>
        Loading preview…
      </div>
    );
  }

  const { cols, rows } = slide.grid;

  function renderElement(el) {
    switch (el.type) {
      case 'main-feed':      return <MainFeedEl requests={requests} requestUrl={requestUrl} />;
      case 'request-cta':    return <RequestCtaEl requestUrl={requestUrl} />;
      case 'feed-panel':     return <FeedPanelEl requests={requests} />;
      case 'now-playing':    return <NowPlayingEl requests={requests} />;
      case 'queue-list':     return <QueueListEl requests={requests} />;
      case 'message-banner': return <MessageBannerEl message={activeMessage} />;
      case 'payment-links':  return <PaymentLinksEl paymentLinks={paymentLinks} />;
      case 'beats-ad':       return <BeatsAdEl requests={requests} />;
      case 'image':          return <ImageEl src={el.src} fit={el.fit} alt={el.alt} />;
      default:               return <PlaceholderEl type={el.type} />;
    }
  }

  return (
    <>
      <Head>
        <title>Feed Preview — {template.name}</title>
      </Head>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          background: '#0e0e18',
          overflow: 'hidden',
          fontFamily: 'Montserrat, system-ui, sans-serif',
          color: '#e2e2f0',
        }}
      >
        {slide.elements.map(el => (
          <div
            key={el.id}
            style={{
              gridColumn: `${el.col} / span ${el.colSpan}`,
              gridRow: `${el.row} / span ${el.rowSpan}`,
              overflow: 'hidden',
              minWidth: 0,
              minHeight: 0,
            }}
          >
            {renderElement(el)}
          </div>
        ))}
      </div>
      {activeMessage && (
        <div className={feedStyles.messageBanner} style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
          <div className={feedStyles.messageText}>{activeMessage.text}</div>
          {activeMessage.expiresAt && (
            <div className={feedStyles.messageTimer}>
              <div className={feedStyles.messageTimerFill} style={{ width: `${msgProgress}%` }} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
