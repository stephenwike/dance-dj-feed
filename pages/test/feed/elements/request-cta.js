import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import TestLayout from '../../../../components/test/TestLayout';
import feedStyles from '../../../dj-feed/dj-feed.module.css';

const QRCodeSVG = dynamic(() => import('qrcode.react').then(m => m.QRCodeSVG), { ssr: false });

const CRUMBS = [
  { label: 'Feed Elements', href: '/test/feed/elements' },
  { label: 'Request CTA' },
];

const labelStyle = { fontSize: '0.72rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 6, display: 'block', fontFamily: 'system-ui' };
const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(138,92,255,0.25)',
  borderRadius: 6, color: '#e2e2f0', fontSize: '0.78rem', padding: '6px 10px', outline: 'none',
  fontFamily: 'system-ui',
};

export default function RequestCtaTest() {
  const [previewUrl, setPreviewUrl] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  useEffect(() => {
    const base = `${window.location.origin}/dj-request`;
    setPreviewUrl(base);
    setCustomUrl(base);
  }, []);

  const qrValue = customUrl.trim() || previewUrl;

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
      <div className={feedStyles.left} style={{ width: '100%', height: '100%', borderRadius: 0, border: 'none' }}>
        <h1 className={feedStyles.title}>Request a Dance</h1>

        <div className={feedStyles.qrWrap}>
          {qrValue ? (
            <QRCodeSVG value={qrValue} size={220} bgColor="#ffffff" fgColor="#1a1033" level="M" />
          ) : (
            <div className={feedStyles.qrPlaceholder} />
          )}
        </div>

        <p className={feedStyles.urlHint}>{qrValue}</p>

        <ol className={feedStyles.steps}>
          <li><span className={feedStyles.stepNum}>1</span><span>Scan the QR code with your phone</span></li>
          <li><span className={feedStyles.stepNum}>2</span><span>Search for a dance you&apos;d like to see</span></li>
          <li><span className={feedStyles.stepNum}>3</span><span>Submit your request!</span></li>
        </ol>
      </div>
    </TestLayout>
  );
}
