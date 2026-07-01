import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';

export default function OGPreview() {
  const ref = useRef(null);
  const [status, setStatus] = useState('ready');

  async function download() {
    if (!ref.current) return;
    setStatus('generating…');
    try {
      const dataUrl = await toPng(ref.current, { width: 1200, height: 630, pixelRatio: 1 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'og-image.png';
      a.click();
      setStatus('downloaded ✓');
    } catch (e) {
      setStatus('error — check console');
      console.error(e);
    }
  }

  return (
    <div style={{ background: '#111', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px', gap: 24, fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Controls ── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <button
          onClick={download}
          style={{ background: '#8A5CFF', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          Download og-image.png
        </button>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{status}</span>
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>→ save to /public/og-image.png</span>
      </div>

      {/* ── The OG image at 1200×630 ── */}
      <div ref={ref} style={{
        width: 1200,
        height: 630,
        background: '#0b0b18',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 100px',
        boxSizing: 'border-box',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}>

        {/* Background glow */}
        <div style={{
          position: 'absolute', top: -180, left: -100,
          width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(138,92,255,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -200, right: 80,
          width: 500, height: 500,
          background: 'radial-gradient(circle, rgba(138,92,255,0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Grid lines */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
        }} />

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 620, position: 'relative', zIndex: 1 }}>

          {/* Logo row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 42 }}>🎛️</span>
            <span style={{ fontSize: 42, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>DanceFeed</span>
          </div>

          {/* Tagline */}
          <div style={{ fontSize: 26, fontWeight: 700, color: 'rgba(255,255,255,0.55)', lineHeight: 1.4, letterSpacing: '-0.01em' }}>
            Live request platform for<br />line dance DJs.
          </div>

          {/* Description */}
          <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, maxWidth: 520 }}>
            Attendees scan a QR code to request dances in real time — no app to download. You approve, queue, and play from your own screen.
          </div>

          {/* Feature pills */}
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            {[['📱', 'Scan & Request'], ['🎛️', 'DJ Approves'], ['📺', 'Live Feed']].map(([icon, label]) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 100,
                padding: '8px 18px',
                fontSize: 15, fontWeight: 700,
                color: 'rgba(255,255,255,0.65)',
              }}>
                <span>{icon}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right side — mock controller panel */}
        <div style={{
          position: 'absolute', right: 80, top: '50%',
          transform: 'translateY(-50%)',
          width: 340,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 0 80px rgba(138,92,255,0.12)',
        }}>
          {/* Top bar */}
          <div style={{
            background: '#13121f',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>🎛️ DJ Controller</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#22c55e' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              LIVE
            </span>
          </div>

          {/* Pending requests */}
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>PENDING REQUESTS</div>
            {[
              { name: 'Tush Push', count: 4, diff: '#f59e0b' },
              { name: 'Electric Slide', count: 2, diff: '#22c55e' },
              { name: 'Copperhead Road', count: 1, diff: '#ef4444' },
            ].map(r => (
              <div key={r.name} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8, padding: '8px 12px',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: r.diff }}>{r.count} requests</div>
                </div>
                <div style={{
                  background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)',
                  borderRadius: 6, padding: '4px 10px',
                  fontSize: 11, fontWeight: 700, color: '#6ee7b7',
                }}>✓ Approve</div>
              </div>
            ))}

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, marginTop: 2 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>NOW PLAYING</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(138,92,255,0.08)',
                border: '1px solid rgba(138,92,255,0.2)',
                borderRadius: 8, padding: '8px 12px',
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#8A5CFF', display: 'inline-block' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Watermelon Crawl</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom URL bar */}
        <div style={{
          position: 'absolute', bottom: 32, left: 100,
          fontSize: 14, fontWeight: 600,
          color: 'rgba(255,255,255,0.2)',
          letterSpacing: '0.02em',
        }}>
          dancefeed.app
        </div>

      </div>
    </div>
  );
}
