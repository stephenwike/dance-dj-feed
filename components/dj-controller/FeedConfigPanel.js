import { useState, useRef, useEffect } from 'react';
import styles from '../../pages/dj-controller/dj-controller.module.css';

const RATIOS = [
  { label: '16:9', w: 1280, h: 720 },
  { label: '4:3',  w: 1024, h: 768 },
  { label: '21:9', w: 2560, h: 1080 },
];

export default function FeedConfigPanel({ activeSession }) {
  const [ratio, setRatio] = useState(RATIOS[0]);
  const wrapRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(320);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = containerWidth / ratio.w;
  const previewHeight = Math.round(ratio.h * scale);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Feed Configuration</span>
        <div className={styles.ratioButtons}>
          {RATIOS.map(r => (
            <button
              key={r.label}
              className={`${styles.ratioBtn} ${ratio.label === r.label ? styles.ratioBtnActive : ''}`}
              onClick={() => setRatio(r)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scaled live preview */}
      <div ref={wrapRef} className={styles.feedPreviewWrap} style={{ height: previewHeight }}>
        {activeSession ? (
          <iframe
            src={`/feed/${activeSession.slug}`}
            title="Feed Preview"
            style={{
              width: ratio.w,
              height: ratio.h,
              border: 'none',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <div className={styles.feedPreviewEmpty}>
            Start a session to preview the feed
          </div>
        )}
      </div>

      {/* Coming soon config options */}
      <div className={styles.feedConfigOptions}>
        <p className={styles.feedConfigOptionsLabel}>Configuration options coming soon</p>
        <div className={styles.feedConfigItems}>
          <div className={styles.feedConfigItem}>
            <span className={styles.feedConfigItemIcon}>🎨</span>
            <span>Theme &amp; colors</span>
          </div>
          <div className={styles.feedConfigItem}>
            <span className={styles.feedConfigItemIcon}>📋</span>
            <span>Queue display options</span>
          </div>
          <div className={styles.feedConfigItem}>
            <span className={styles.feedConfigItemIcon}>📢</span>
            <span>Persistent banner text</span>
          </div>
          <div className={styles.feedConfigItem}>
            <span className={styles.feedConfigItemIcon}>💰</span>
            <span>Tip prompts &amp; QR codes</span>
          </div>
        </div>
      </div>
    </div>
  );
}
