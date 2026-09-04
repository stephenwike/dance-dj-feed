import { useState, useEffect } from 'react';
import TestLayout from '../../../../components/test/TestLayout';
import RequestCTA from '../../../../components/feed/RequestCTA';

const CRUMBS = [
  { label: 'Feed Elements', href: '/test/feed/elements' },
  { label: 'Request CTA' },
];

const labelStyle = {
  fontSize: '0.72rem', fontWeight: 600,
  color: 'rgba(255,255,255,0.4)',
  marginBottom: 6, display: 'block',
  fontFamily: 'system-ui',
};
const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(138,92,255,0.25)',
  borderRadius: 6, color: '#e2e2f0',
  fontSize: '0.78rem', padding: '6px 10px',
  outline: 'none', fontFamily: 'system-ui',
};

export default function RequestCtaTest() {
  const [customUrl, setCustomUrl] = useState('');

  useEffect(() => {
    setCustomUrl(`${window.location.origin}/dj-request`);
  }, []);

  const controls = (
    <div>
      <label style={labelStyle}>QR URL</label>
      <input
        value={customUrl}
        onChange={e => setCustomUrl(e.target.value)}
        style={inputStyle}
        placeholder="https://…"
      />
    </div>
  );

  return (
    <TestLayout title="Request CTA" crumbs={CRUMBS} controls={controls}>
      <RequestCTA url={customUrl} />
    </TestLayout>
  );
}
