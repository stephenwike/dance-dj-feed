import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import styles from './RequestCTA.module.css';

const QRCodeSVG = dynamic(() => import('qrcode.react').then(m => m.QRCodeSVG), { ssr: false });

export default function RequestCTA({ url = '' }) {
  const ctaRef = useRef(null);
  const [qrSize, setQrSize] = useState(200);

  useEffect(() => {
    if (!ctaRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      let size;
      if (height < 450) {
        // Side mode — QR is height-constrained; leave a small padding budget
        const pad = Math.min(height * 0.08, 24) * 2;
        size = Math.max(60, Math.min(height - pad, width * 0.65));
      } else {
        // Column mode — balanced width/height constraint
        size = Math.max(60, Math.min(width * 0.78, height * 0.58));
      }
      setQrSize(Math.round(size));
    });
    ro.observe(ctaRef.current);
    return () => ro.disconnect();
  }, []);

  // Title scales proportionally with the QR so they read as one visual unit
  const titleFontSize = Math.max(14, Math.round(qrSize * 0.13));

  return (
    <div className={styles.outer}>
      <div className={styles.cta} ref={ctaRef}>

        <h1 className={styles.title} style={{ fontSize: titleFontSize }}>
          <span className={styles.titleWord}>Request</span>
          <span className={styles.titleWord}>Dances</span>
        </h1>

        <div className={styles.qrWrap}>
          {url ? (
            <QRCodeSVG value={url} size={qrSize} bgColor="#ffffff" fgColor="#1a1033" level="M" />
          ) : (
            <div className={styles.qrPlaceholder} style={{ width: qrSize, height: qrSize }} />
          )}
        </div>

        <ol className={styles.steps}>
          <li><span className={styles.stepNum}>1</span><span>Scan the QR code with your phone</span></li>
          <li><span className={styles.stepNum}>2</span><span>Search for a dance you&apos;d like to see</span></li>
          <li><span className={styles.stepNum}>3</span><span>Submit your request!</span></li>
        </ol>

      </div>
    </div>
  );
}
