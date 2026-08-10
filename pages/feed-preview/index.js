import { useState, useEffect, useMemo } from 'react';
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
  const { templateId, sessionId } = query;

  const [template, setTemplate] = useState(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);

  useEffect(() => {
    if (!isReady) return;
    if (!templateId || templateId === 'default') {
      setTemplate(DEFAULT_TEMPLATE);
      setLoadingTemplate(false);
      return;
    }
    fetch(`/api/dj/feed-templates/${templateId}`)
      .then(r => r.ok ? r.json() : null)
      .then(t => {
        setTemplate(t ?? DEFAULT_TEMPLATE);
        setLoadingTemplate(false);
      })
      .catch(() => {
        setTemplate(DEFAULT_TEMPLATE);
        setLoadingTemplate(false);
      });
  }, [isReady, templateId]);

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

  if (loadingTemplate || !slide) {
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
