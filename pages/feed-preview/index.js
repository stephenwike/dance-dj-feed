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

// ── Element renderers ──────────────────────────────────────────────

function MainFeedEl({ requests }) {
  const [requestUrl, setRequestUrl] = useState('');
  useEffect(() => { setRequestUrl(`${window.location.origin}/dj-request`); }, []);

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
            {playing && <NowPlayingCard request={playing} />}
            {upcoming.length > 0 && <UpNextList items={upcoming} />}
          </>
        )}
      </div>
    </div>
  );
}

function RequestCtaEl() {
  const [requestUrl, setRequestUrl] = useState('');
  useEffect(() => {
    setRequestUrl(`${window.location.origin}/dj-request`);
  }, []);

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
          {playing && <NowPlayingCard request={playing} />}
          {upcoming.length > 0 && <UpNextList items={upcoming} />}
        </>
      )}
    </div>
  );
}

function NowPlayingEl({ requests }) {
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
      <NowPlayingCard request={playing} />
    </div>
  );
}

function QueueListEl({ requests }) {
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
      <UpNextList items={upcoming} />
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

function NowPlayingCard({ request }) {
  const isPartner = request.danceType === 'partner';
  const dc = isPartner ? null : request.difficulty ? diffColor(request.difficulty) : '#8A5CFF';
  return (
    <div
      className={feedStyles.queueItemPlaying}
      style={dc ? {
        borderLeftColor: dc, borderLeftWidth: '6px',
        background: `rgba(${hexToRgb(dc)}, 0.18)`,
        boxShadow: `inset 4px 0 32px rgba(${hexToRgb(dc)}, 0.12)`,
      } : {
        borderLeftColor: 'rgba(255,255,255,0.35)', borderLeftWidth: '6px',
        background: 'rgba(255,255,255,0.04)',
      }}
    >
      <div className={feedStyles.playingTop}>
        <div className={feedStyles.playingLabel}>
          <span className={feedStyles.playingDot} style={dc ? { background: dc } : { background: 'rgba(255,255,255,0.7)' }} />
          <span className={feedStyles.statusLabel}>Playing</span>
        </div>
        {isPartner && <span className={feedStyles.partnerBadge}>👫 Partner Dance</span>}
      </div>
      <div className={feedStyles.queueDancePlaying}>
        {isPartner ? (request.songName || request.danceName) : request.danceName}
      </div>
    </div>
  );
}

function UpNextList({ items }) {
  return (
    <>
      <div className={feedStyles.upNextHeader}>
        <span className={feedStyles.upNextDot} />
        <span className={feedStyles.statusLabel}>Up Next</span>
      </div>
      <ol className={feedStyles.queueList}>
        {items.map((r, num) => (
          <li key={r._id} className={feedStyles.queueItem}>
            <span className={feedStyles.queueNum}>{r.danceType === 'message' ? '💬' : num + 1}</span>
            <span className={feedStyles.queueDanceCol}>
              <span className={feedStyles.queueDance}>
                {r.danceType === 'partner' ? (r.songName || r.danceName) : r.danceName}
              </span>
            </span>
            <div className={feedStyles.queueRight}>
              {r.difficulty && r.danceType !== 'partner' && (
                <span className={feedStyles.diffPip} style={{ background: diffColor(r.difficulty) }}>{r.difficulty}</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

// ── Beats advertisement ────────────────────────────────────────────

const BEATS_AD_DANCES = [
  { id: 'es', name: 'Electric Slide',       sub: 'Intermediate', baseBeats: 4, hero: false },
  { id: 'bs', name: "Boot Scootin' Boogie", sub: 'Beginner',     baseBeats: 2, hero: false },
  { id: 'cs', name: 'Cupid Shuffle',        sub: 'Beginner',     baseBeats: 1, hero: false },
  { id: 'wc', name: 'Watermelon Crawl',     sub: 'Improver',     baseBeats: 0, hero: true  },
];
const BEATS_AD_ORDERS = [
  ['es', 'bs', 'cs', 'wc'],
  ['es', 'bs', 'wc', 'cs'],
  ['es', 'wc', 'bs', 'cs'],
  ['wc', 'es', 'bs', 'cs'],
];

function BeatsAdEl() {
  const [order, setOrder] = useState(BEATS_AD_ORDERS[0]);
  const [heroState, setHeroState] = useState('idle'); // idle | ticking | jumped

  const timers   = useRef([]);
  const rafId    = useRef(null);
  const flipData = useRef(null);
  const heroBeatsRef = useRef(0);

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
        const el = document.getElementById('ba-bc-wc');
        if (el) el.textContent = beats;
        if (t < 1) { rafId.current = requestAnimationFrame(frame); }
        else { onDone(); }
      }
      rafId.current = requestAnimationFrame(frame);
    }

    function flipTo(newOrder, nextHeroState) {
      const oldTops = {};
      BEATS_AD_ORDERS[0].forEach(id => {
        const el = document.getElementById('ba-qi-' + id);
        if (el) oldTops[id] = el.getBoundingClientRect().top;
      });
      flipData.current = { oldTops, newOrder };
      setOrder(newOrder);
      setHeroState(nextHeroState);
    }

    function run() {
      heroBeatsRef.current = 0;
      setOrder(BEATS_AD_ORDERS[0]);
      setHeroState('idle');
      const bc = document.getElementById('ba-bc-wc');
      if (bc) bc.textContent = '0';

      addTimer(() => {
        setHeroState('ticking');
        tickBeats(0, 1, 1200, () => {
          flipTo(BEATS_AD_ORDERS[1], 'jumped');
          addTimer(() => {
            setHeroState('ticking');
            tickBeats(1, 2, 1000, () => {
              flipTo(BEATS_AD_ORDERS[2], 'jumped');
              addTimer(() => {
                setHeroState('ticking');
                tickBeats(2, 5, 2200, () => {
                  flipTo(BEATS_AD_ORDERS[3], 'jumped');
                  addTimer(() => {
                    const list = document.getElementById('ba-queue-list');
                    if (list) { list.style.transition = 'opacity 0.55s'; list.style.opacity = '0'; }
                    addTimer(() => {
                      if (list) { list.style.transition = 'none'; list.style.opacity = '1'; }
                      addTimer(run, 400);
                    }, 650);
                  }, 3200);
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

        {/* Now Playing card */}
        <div style={{
          background: 'rgba(34,197,94,0.1)', border: '1.5px solid rgba(34,197,94,0.28)',
          borderRadius: 'clamp(10px, 1.4vw, 18px)', padding: '1.8vh 2vw',
          display: 'flex', alignItems: 'center', gap: '1.6vw', flexShrink: 0,
        }}>
          <div style={{
            width: 'clamp(36px, 4vw, 62px)', height: 'clamp(36px, 4vw, 62px)',
            borderRadius: '50%', background: 'rgba(34,197,94,0.18)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'clamp(1rem, 1.8vw, 2.2rem)', color: '#22c55e',
          }}>♫</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'clamp(0.6rem, 0.9vw, 1.1rem)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.13em', color: '#22c55e', marginBottom: '0.4vh' }}>Now Playing</div>
            <div style={{ fontSize: 'clamp(1rem, 2vw, 2.6rem)', fontWeight: 800, color: '#F5F2E8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Cha Cha Slide</div>
            <div style={{ fontSize: 'clamp(0.65rem, 1.1vw, 1.4rem)', color: 'rgba(245,242,232,0.3)', marginTop: '0.3vh' }}>Beginner</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 'clamp(18px, 2.2vw, 32px)', flexShrink: 0 }}>
            {[{ h: '45%', d: '0.65s' }, { h: '80%', d: '0.48s' }, { h: '60%', d: '0.72s' }, { h: '95%', d: '0.55s' }, { h: '50%', d: '0.63s' }].map((b, i) => (
              <div key={i} style={{ width: 'clamp(3px, 0.4vw, 6px)', background: '#22c55e', borderRadius: 2, height: b.h, animation: `ba-bar ${b.d} ease-in-out infinite alternate` }} />
            ))}
          </div>
        </div>

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
              const d = BEATS_AD_DANCES.find(x => x.id === id);
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
                    fontSize: 'clamp(0.9rem, 1.6vw, 2rem)', fontWeight: 800,
                    color: jumped ? '#FFCC44' : active ? '#F4A916' : 'rgba(245,242,232,0.3)',
                    width: 'clamp(20px, 2vw, 30px)', textAlign: 'center', flexShrink: 0,
                    transition: 'color 0.35s', fontVariantNumeric: 'tabular-nums',
                  }}>{idx + 1}</span>

                  {/* Dance info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 'clamp(0.9rem, 1.9vw, 2.4rem)', fontWeight: 700,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      color: active ? '#FFCC44' : '#F5F2E8', transition: 'color 0.35s',
                    }}>{d.name}</div>
                    <div style={{ fontSize: 'clamp(0.62rem, 1vw, 1.2rem)', color: 'rgba(245,242,232,0.3)', marginTop: '0.3vh' }}>{d.sub}</div>
                  </div>

                  {/* Beat chip */}
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: '0.5vw', flexShrink: 0,
                    fontSize: 'clamp(0.85rem, 1.5vw, 1.9rem)', fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    color: active ? '#FFCC44' : 'rgba(245,242,232,0.3)',
                    border: `1.5px solid ${active ? 'rgba(244,169,22,0.32)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '100px', padding: '0.5vh 1vw 0.5vh 0.7vw',
                    background: active ? 'rgba(244,169,22,0.13)' : 'transparent',
                    boxShadow: jumped ? '0 0 18px rgba(244,169,22,0.4)' : ticking ? '0 0 12px rgba(244,169,22,0.25)' : 'none',
                    transition: 'color 0.3s, background 0.3s, border-color 0.3s, box-shadow 0.3s',
                  }}>
                    <span style={{ ...coin('clamp(13px, 1.5vw, 22px)', active ? 1 : 0.35), boxShadow: jumped ? '0 0 10px rgba(244,169,22,0.65)' : 'none', transition: 'opacity 0.3s, box-shadow 0.3s' }} />
                    <span id={d.hero ? 'ba-bc-wc' : undefined}>{d.hero ? heroBeatsRef.current : d.baseBeats}</span>
                  </span>

                  {/* Up arrow */}
                  {showArrow && <span style={{ fontSize: 'clamp(0.8rem, 1.4vw, 1.8rem)', fontWeight: 900, color: '#FFCC44', flexShrink: 0, animation: 'ba-arrow-bob 0.9s ease-in-out infinite' }}>↑</span>}

                  {/* Up Next badge */}
                  {isNext && (
                    <span style={{
                      position: 'absolute', top: '0.5vh', right: 0,
                      fontSize: 'clamp(0.5rem, 0.7vw, 0.85rem)', fontWeight: 900,
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
  }, [isReady, effectiveTemplateId, useSessionLookup]);

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
      case 'main-feed':      return <MainFeedEl requests={requests} />;
      case 'request-cta':    return <RequestCtaEl />;
      case 'feed-panel':     return <FeedPanelEl requests={requests} />;
      case 'now-playing':    return <NowPlayingEl requests={requests} />;
      case 'queue-list':     return <QueueListEl requests={requests} />;
      case 'message-banner': return <MessageBannerEl message={activeMessage} />;
      case 'payment-links':  return <PaymentLinksEl paymentLinks={paymentLinks} />;
      case 'beats-ad':       return <BeatsAdEl />;
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
    </>
  );
}
