import { ImageResponse } from 'next/og';
import { shareMeta } from '../../../../lib/dj/shareFormat';

/**
 * Public: the cover image for a share link (1200×630, the size WhatsApp and
 * other apps show as a large link preview): the session's name, date and
 * stats, and its most-requested dances.
 */
export const config = { runtime: 'edge' };

const W = 1200;
const H = 630;
const ACCENT = '#8A5CFF';

// Montserrat (the app's font), fetched once per instance. Falls back to the
// built-in font if the CDN can't be reached.
const FONT_BASE = 'https://cdn.jsdelivr.net/npm/@fontsource/montserrat@5.0.18/files';
let fontsPromise = null;
function loadFonts() {
  fontsPromise ??= Promise.all(
    [[500, 'montserrat-latin-500-normal.woff'], [800, 'montserrat-latin-800-normal.woff']].map(async ([weight, file]) => {
      const res = await fetch(`${FONT_BASE}/${file}`);
      if (!res.ok) throw new Error(`font ${res.status}`);
      return { name: 'Montserrat', data: await res.arrayBuffer(), weight, style: 'normal' };
    }),
  ).catch(() => { fontsPromise = null; return []; });
  return fontsPromise;
}

function Stat({ value, label }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', flex: 1,
      padding: '22px 26px', borderRadius: 20,
      background: 'rgba(138,92,255,0.12)', border: '2px solid rgba(138,92,255,0.35)',
    }}>
      <span style={{ fontSize: 76, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 26, fontWeight: 500, color: 'rgba(226,226,240,0.7)', marginTop: 10 }}>{label}</span>
    </div>
  );
}

function Card({ report }) {
  const { stats, topDances } = report;
  const name = report.name.length > 48 ? `${report.name.slice(0, 46)}…` : report.name;
  return (
    <div style={{
      width: W, height: H, display: 'flex', flexDirection: 'column',
      padding: '52px 64px', background: '#0b0b18', color: '#e2e2f0',
      fontFamily: 'Montserrat', position: 'relative',
    }}>
      {/* Glow */}
      <div style={{
        position: 'absolute', top: -220, right: -160, width: 700, height: 700, display: 'flex',
        background: 'radial-gradient(circle, rgba(138,92,255,0.28) 0%, rgba(138,92,255,0) 70%)',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: ACCENT, letterSpacing: 1 }}>DANCEFEED</span>
        <span style={{
          fontSize: 22, fontWeight: 800, padding: '8px 18px', borderRadius: 30,
          color: report.live ? '#4ade80' : 'rgba(226,226,240,0.7)',
          background: report.live ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)',
        }}>
          {report.live ? '● LIVE' : 'SESSION REPORT'}
        </span>
      </div>

      <span style={{ fontSize: name.length > 30 ? 54 : 66, fontWeight: 800, color: '#fff', marginTop: 26, lineHeight: 1.1 }}>
        {name}
      </span>
      <span style={{ fontSize: 28, fontWeight: 500, color: 'rgba(226,226,240,0.65)', marginTop: 12 }}>
        {shareMeta(report)}
      </span>

      <div style={{ display: 'flex', marginTop: 'auto', gap: 24 }}>
        <div style={{ display: 'flex', gap: 20, flex: topDances.length ? 3 : 1 }}>
          <Stat value={stats.dances} label={stats.dances === 1 ? 'dance played' : 'dances played'} />
          {stats.dancers > 0 && <Stat value={stats.dancers} label={stats.dancers === 1 ? 'dancer' : 'dancers'} />}
          {stats.requests > 0 && <Stat value={stats.requests} label={stats.requests === 1 ? 'request' : 'requests'} />}
        </div>
        {topDances.length > 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', flex: 2, padding: '20px 26px', borderRadius: 20,
            background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)',
          }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: ACCENT, letterSpacing: 1 }}>MOST REQUESTED</span>
            {topDances.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 26 }}>
                <span style={{ fontWeight: 800, color: '#fff', maxWidth: 300, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {d.danceName}
                </span>
                <span style={{ fontWeight: 500, color: 'rgba(226,226,240,0.6)', marginLeft: 12 }}>×{d.requests}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div style={{
      width: W, height: H, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0b0b18', color: ACCENT, fontSize: 64, fontWeight: 800, fontFamily: 'Montserrat',
    }}>
      DANCEFEED
    </div>
  );
}

export default async function handler(req) {
  const { searchParams, pathname } = new URL(req.url);
  const token = searchParams.get('token') ?? pathname.split('/').at(-2);
  const [fonts, report] = await Promise.all([
    loadFonts(),
    fetch(new URL(`/api/share/${encodeURIComponent(token)}`, req.url)).then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  return new ImageResponse(report ? <Card report={report} /> : <NotFound />, {
    width: W,
    height: H,
    fonts: fonts.length ? fonts : undefined,
    headers: { 'Cache-Control': report ? 'public, s-maxage=300, stale-while-revalidate=3600' : 'public, s-maxage=60' },
  });
}
