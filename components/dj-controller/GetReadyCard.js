import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import s from './GetReadyCard.module.css';

const QRCodeSVG = dynamic(() => import('qrcode.react').then(mod => mod.QRCodeSVG), { ssr: false });

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }
  return <button type="button" className={s.linkBtn} onClick={copy}>{copied ? '✓ Copied' : 'Copy link'}</button>;
}

/**
 * Shown once, right after an event goes live: put the feed on the TV, and
 * let attendees find the request page. The same links stay available from
 * the controller's Feed and Share buttons.
 */
export default function GetReadyCard({ session, onDismiss }) {
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);
  if (!origin || !session?.slug) return null;
  const feedUrl = `${origin}/feed/${session.slug}`;
  const requestUrl = `${origin}/request/${session.slug}`;

  return (
    <div className={s.overlay} onMouseDown={e => e.target === e.currentTarget && onDismiss()}>
      <div className={s.card} role="dialog" aria-labelledby="get-ready-title">
        <div className={s.head}>
          <span className={s.kicker}>🟢 {session.name} is live</span>
          <h2 id="get-ready-title" className={s.title}>Get the room ready</h2>
        </div>

        <div className={s.steps}>
          <section className={s.step}>
            <div className={s.qr}><QRCodeSVG value={feedUrl} size={112} bgColor="#ffffff" fgColor="#1a1033" level="M" /></div>
            <div className={s.stepText}>
              <span className={s.stepTitle}>🖥️ Put the feed on the TV</span>
              <span className={s.stepDesc}>Open this on the projector or TV everyone can see. It shows the queue and a QR code for requests.</span>
              <span className={s.url}>{feedUrl}</span>
              <div className={s.links}>
                <a className={s.linkBtnPrimary} href={feedUrl} target="_blank" rel="noreferrer">Open feed ↗</a>
                <CopyButton text={feedUrl} />
              </div>
            </div>
          </section>

          <section className={s.step}>
            <div className={s.qr}><QRCodeSVG value={requestUrl} size={112} bgColor="#ffffff" fgColor="#1a1033" level="M" /></div>
            <div className={s.stepText}>
              <span className={s.stepTitle}>📱 Dancers request from their phones</span>
              <span className={s.stepDesc}>They scan the code on the feed — no app needed. You can also share the link before the event.</span>
              <span className={s.url}>{requestUrl}</span>
              <div className={s.links}>
                <CopyButton text={requestUrl} />
                <a className={s.linkBtn} href={requestUrl} target="_blank" rel="noreferrer">Preview ↗</a>
              </div>
            </div>
          </section>
        </div>

        <button type="button" className={s.done} onClick={onDismiss}>Got it — to the controller</button>
      </div>
    </div>
  );
}
