import { useState, useRef, useCallback, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import styles from './TestLayout.module.css';

const HANDLE = 16; // handle thickness in px

const PRESETS = [
  { label: 'SE',     width: 375,  title: 'iPhone SE (375px)' },
  { label: 'Phone',  width: 390,  title: 'iPhone 14 (390px)' },
  { label: 'Tablet', width: 768,  title: 'iPad (768px)' },
  { label: 'Laptop', width: 1280, title: 'Laptop (1280px)' },
  { label: 'Full',   width: null, title: 'Full canvas width' },
];

export default function TestLayout({ title, crumbs = [], controls, children }) {
  const [previewWidth,  setPreviewWidth]  = useState(null); // null = fill canvas
  const [previewHeight, setPreviewHeight] = useState(null); // null = fill canvas
  const [activePreset,  setActivePreset]  = useState('Full');
  const [draggingEdge,  setDraggingEdge]  = useState(null);
  const [canvasSize,    setCanvasSize]    = useState({ w: 0, h: 0 });

  const outerRef  = useRef(null);
  const canvasRef = useRef(null);

  // Track canvas dimensions for handle placement and clamping
  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setCanvasSize({ w: width, h: height });
    });
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  const applyPreset = (preset) => {
    setPreviewWidth(preset.width);
    setActivePreset(preset.label);
  };

  const startDrag = useCallback((edge) => (e) => {
    e.preventDefault();
    const startX   = e.clientX;
    const startY   = e.clientY;
    const startW   = outerRef.current?.offsetWidth  ?? 800;
    const startH   = outerRef.current?.offsetHeight ?? 600;
    setDraggingEdge(edge);

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (edge === 'right' || edge === 'corner') {
        // ×2 so the right edge tracks the cursor exactly while preview stays centred
        setPreviewWidth(w => Math.max(280, startW + dx * 2));
        setActivePreset(null);
      }
      if (edge === 'bottom' || edge === 'corner') {
        // ×2 so the bottom edge tracks the cursor while preview stays centred
        setPreviewHeight(Math.max(120, startH + dy * 2));
      }
    };

    const onUp = () => {
      setDraggingEdge(null);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  useEffect(() => {
    document.body.style.userSelect = draggingEdge ? 'none' : '';
    return () => { document.body.style.userSelect = ''; };
  }, [draggingEdge]);

  // Effective dimensions — leave one handle-width of room on each side so
  // handles always sit outside the preview within the canvas bounds
  const maxW = Math.max(0, canvasSize.w - HANDLE * 2);
  const maxH = Math.max(0, canvasSize.h - HANDLE * 2);
  const effW = Math.min(previewWidth  ?? maxW, maxW);
  const effH = Math.min(previewHeight ?? maxH, maxH);

  // Preview is centred in both axes; centering pushes exactly HANDLE px of
  // margin onto each side in the "full" case, which is where the handles live
  const previewLeft = canvasSize.w > 0 ? (canvasSize.w - effW) / 2 : 0;
  const previewTop  = canvasSize.h > 0 ? (canvasSize.h - effH) / 2 : 0;

  // Handles sit just OUTSIDE the preview edges
  const rightHandleStyle  = { left: previewLeft + effW,  top: previewTop,         width: HANDLE, height: effH };
  const bottomHandleStyle = { left: previewLeft,          top: previewTop + effH,  width: effW,   height: HANDLE };
  const cornerHandleStyle = { left: previewLeft + effW,   top: previewTop + effH,  width: HANDLE, height: HANDLE };

  const wStr = previewWidth  ? `${Math.round(previewWidth)}px`  : '100%';
  const hStr = previewHeight ? `${Math.round(previewHeight)}px` : '100%';
  const sizeLabel = previewHeight ? `${wStr} × ${hStr}` : wStr;

  return (
    <>
      <Head>
        <title>{title} — Test</title>
        <style>{`*, *::before, *::after { box-sizing: border-box; } body { margin: 0; background: #0a0a14; }`}</style>
      </Head>

      <div className={styles.shell}>

        {/* ── Top bar ── */}
        <div className={styles.topBar}>
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span className={styles.crumbSep}>›</span>}
              {c.href
                ? <Link href={c.href} className={styles.crumb}>{c.label}</Link>
                : <span className={styles.crumbCurrent}>{c.label}</span>
              }
            </span>
          ))}
        </div>

        {/* ── Preset bar ── */}
        <div className={styles.controlsBar}>
          <span className={styles.widthDisplay}>{sizeLabel}</span>
          <div className={styles.divider} />
          {PRESETS.map(p => (
            <button
              key={p.label}
              title={p.title}
              className={`${styles.presetBtn} ${activePreset === p.label ? styles.presetBtnActive : ''}`}
              onClick={() => applyPreset(p)}
            >
              {p.label}
              {p.width && <span className={styles.presetPx}>{p.width}</span>}
            </button>
          ))}
        </div>

        {/* ── Canvas row ── */}
        <div className={styles.canvasRow}>

          <div className={styles.canvas} ref={canvasRef}>

            {/* centred preview box */}
            <div
              ref={outerRef}
              className={styles.previewOuter}
              style={{
                width:  previewWidth  ? `${effW}px` : '100%',
                height: previewHeight ? `${effH}px` : '100%',
              }}
            >
              <div className={styles.previewInner}>
                {children}
              </div>
            </div>

            {/* resize handles — absolutely positioned in canvas coordinates */}
            <div
              className={`${styles.handle} ${styles.handleRight} ${draggingEdge === 'right'  || draggingEdge === 'corner' ? styles.handleActive : ''}`}
              style={rightHandleStyle}
              onMouseDown={startDrag('right')}
            />
            <div
              className={`${styles.handle} ${styles.handleBottom} ${draggingEdge === 'bottom' || draggingEdge === 'corner' ? styles.handleActive : ''}`}
              style={bottomHandleStyle}
              onMouseDown={startDrag('bottom')}
            />
            <div
              className={`${styles.handle} ${styles.handleCorner} ${draggingEdge === 'corner' ? styles.handleActive : ''}`}
              style={cornerHandleStyle}
              onMouseDown={startDrag('corner')}
            />

          </div>

          {/* controls panel */}
          {controls && (
            <div className={styles.controlsPanel}>
              <div className={styles.controlsPanelHead}>Controls</div>
              <div className={styles.controlsPanelBody}>{controls}</div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
