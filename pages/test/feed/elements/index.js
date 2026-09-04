import TestLayout from '../../../../components/test/TestLayout';
import Link from 'next/link';

const ELEMENTS = [
  { slug: 'request-cta', label: 'Request CTA', desc: 'QR code + scan instructions sidebar' },
];

const CRUMBS = [
  { label: 'Feed Elements' },
];

export default function FeedElementsIndex() {
  return (
    <TestLayout title="Feed Elements" crumbs={CRUMBS}>
      <div style={{ padding: '40px 24px', maxWidth: 560 }}>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 20px', color: '#fff' }}>
          Feed Elements
        </h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ELEMENTS.map(el => (
            <Link
              key={el.slug}
              href={`/test/feed/elements/${el.slug}`}
              style={{
                display: 'flex', flexDirection: 'column', gap: 2,
                background: 'rgba(138,92,255,0.06)', border: '1px solid rgba(138,92,255,0.2)',
                borderRadius: 10, padding: '14px 18px', textDecoration: 'none',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              <span style={{ color: '#c4a8ff', fontWeight: 600, fontSize: '0.95rem' }}>{el.label}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>{el.desc}</span>
            </Link>
          ))}
        </div>
      </div>
    </TestLayout>
  );
}
