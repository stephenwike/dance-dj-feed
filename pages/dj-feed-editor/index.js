import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import styles from './dj-feed-editor.module.css';
import { ASPECT_RATIOS, ELEMENT_TYPES, DEFAULT_TEMPLATE } from '../../lib/client/dj/feedTemplates';

const fetcher = url => fetch(url).then(r => r.json());

const ELEMENT_COLORS = {
  'main-feed':      { bg: 'rgba(138,92,255,0.18)', border: 'rgba(138,92,255,0.5)',  text: '#c4b5fd' },
  'request-cta':    { bg: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.35)',  text: '#4ade80' },
  'feed-panel':     { bg: 'rgba(138,92,255,0.15)', border: 'rgba(138,92,255,0.4)',  text: '#a78bfa' },
  'now-playing':    { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)',  text: '#60a5fa' },
  'queue-list':     { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', text: '#fbbf24' },
  'message-banner': { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)',  text: '#f87171' },
  'payment-links':  { bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.3)',   text: '#86efac' },
};

function makeSlideId() {
  return `slide_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
}

function makeElementId() {
  return `el_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
}

function findNextAvailableCell(slide) {
  const { cols, rows } = slide.grid;
  const occupied = new Set();
  for (const el of slide.elements ?? []) {
    for (let r = el.row; r < el.row + el.rowSpan; r++) {
      for (let c = el.col; c < el.col + el.colSpan; c++) {
        occupied.add(`${c},${r}`);
      }
    }
  }
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      if (!occupied.has(`${c},${r}`)) return { col: c, row: r };
    }
  }
  return null;
}

function makeDefaultSlide(name = 'New Slide') {
  return {
    id: makeSlideId(),
    name,
    duration: 10,
    grid: { cols: 3, rows: 1 },
    elements: [
      { id: makeElementId(), type: 'request-cta', col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { id: makeElementId(), type: 'feed-panel',  col: 2, row: 1, colSpan: 2, rowSpan: 1 },
    ],
  };
}

function SlideCanvas({ slide, designedFor = '16:9' }) {
  const { cols, rows } = slide.grid;
  const ratio = ASPECT_RATIOS.find(r => r.value === designedFor) ?? ASPECT_RATIOS[0];
  const cells = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      cells.push({ c, r, key: `${c}-${r}` });
    }
  }

  const MAX_H = 280;
  const maxW = Math.round(MAX_H * ratio.w / ratio.h);

  return (
    <div
      className={styles.canvas}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        gap: '6px',
        background: '#0a0a14',
        padding: '10px',
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.07)',
        aspectRatio: `${ratio.w} / ${ratio.h}`,
        width: '100%',
        maxWidth: `min(100%, ${maxW}px)`,
      }}
    >
      {cells.map(({ c, r, key }) => (
        <div
          key={key}
          className={styles.canvasCell}
          style={{ gridColumn: c, gridRow: r }}
        />
      ))}
      {slide.elements.map(el => {
        const meta = ELEMENT_TYPES[el.type] ?? {};
        const color = ELEMENT_COLORS[el.type] ?? ELEMENT_COLORS['feed-panel'];
        return (
          <div
            key={el.id}
            className={styles.canvasElement}
            style={{
              gridColumn: `${el.col} / span ${el.colSpan}`,
              gridRow: `${el.row} / span ${el.rowSpan}`,
              background: color.bg,
              border: `1px solid ${color.border}`,
              color: color.text,
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <span className={styles.canvasElementIcon}>{meta.icon}</span>
            <span className={styles.canvasElementLabel}>{meta.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function FeedEditorPage() {
  const router = useRouter();
  const { id, fork } = router.query;

  const [name, setName] = useState('');
  const [designedFor, setDesignedFor] = useState('16:9');
  const [slides, setSlides] = useState([]);
  const [selectedSlideIdx, setSelectedSlideIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  // changingEl: null (panel in "add" mode) | { slideIdx, elIdx } (panel in "change" mode)
  const [changingEl, setChangingEl] = useState(null);

  const { data: sessions = [] } = useSWR('/api/dj/sessions', fetcher, { refreshInterval: 15000 });
  const activeSession = sessions.find(s => s.status === 'active') ?? null;

  useEffect(() => {
    if (!router.isReady) return;
    if (id) {
      fetch(`/api/dj/feed-templates/${id}`)
        .then(r => r.json())
        .then(t => {
          setName(t.name ?? '');
          setDesignedFor(t.designedFor ?? '16:9');
          setSlides(t.slides ?? []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else if (fork === 'default') {
      setName('Default (Copy)');
      setDesignedFor(DEFAULT_TEMPLATE.designedFor);
      setSlides(DEFAULT_TEMPLATE.slides.map(s => ({
        ...s,
        id: makeSlideId(),
        elements: s.elements.map(e => ({ ...e, id: makeElementId() })),
      })));
      setLoading(false);
    } else {
      setName('New Template');
      setDesignedFor('16:9');
      setSlides([makeDefaultSlide('Main')]);
      setLoading(false);
    }
  }, [router.isReady, id, fork]);

  const selectedSlide = slides[selectedSlideIdx] ?? null;

  function updateSlide(idx, updates) {
    setSlides(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  }

  function addSlide() {
    const newSlide = makeDefaultSlide(`Slide ${slides.length + 1}`);
    setSlides(prev => [...prev, newSlide]);
    setSelectedSlideIdx(slides.length);
  }

  function removeSlide(idx) {
    if (slides.length <= 1) return;
    const next = [...slides];
    next.splice(idx, 1);
    setSlides(next);
    setSelectedSlideIdx(Math.min(selectedSlideIdx, next.length - 1));
  }

  function moveSlide(idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= slides.length) return;
    const next = [...slides];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setSlides(next);
    setSelectedSlideIdx(newIdx);
  }

  function updateElement(slideIdx, elIdx, updates) {
    const slide = slides[slideIdx];
    const elements = slide.elements.map((e, i) => i === elIdx ? { ...e, ...updates } : e);
    updateSlide(slideIdx, { elements });
  }

  function removeElement(slideIdx, elIdx) {
    const slide = slides[slideIdx];
    updateSlide(slideIdx, { elements: slide.elements.filter((_, i) => i !== elIdx) });
  }

  function addElement(slideIdx, type) {
    const slide = slides[slideIdx];
    const cell = findNextAvailableCell(slide);
    if (!cell) return;
    const newEl = { id: makeElementId(), type, ...cell, colSpan: 1, rowSpan: 1 };
    updateSlide(slideIdx, { elements: [...(slide.elements ?? []), newEl] });
  }

  function handlePanelSelect(type) {
    if (changingEl) {
      updateElement(changingEl.slideIdx, changingEl.elIdx, { type });
      setChangingEl(null);
    } else {
      addElement(selectedSlideIdx, type);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body = { name: name.trim() || 'New Template', designedFor, slides };
      const res = id
        ? await fetch(`/api/dj/feed-templates/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch('/api/dj/feed-templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed');
      router.push('/dj-controller');
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  async function handlePreview() {
    const params = new URLSearchParams();
    if (activeSession?._id) params.set('sessionId', String(activeSession._id));

    // If this template is already saved, just open it
    if (id) {
      params.set('templateId', id);
      window.open(`/feed-preview?${params}`, '_blank', 'noopener,noreferrer');
      return;
    }

    // Unsaved new template — save it first so the preview page can fetch it
    setSaving(true);
    setError(null);
    try {
      const body = { name: name.trim() || 'New Template', designedFor, slides };
      const res = await fetch('/api/dj/feed-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed');
      const created = await res.json();
      router.replace(`/dj-feed-editor?id=${created.id}`, undefined, { shallow: true });
      params.set('templateId', created.id);
      window.open(`/feed-preview?${params}`, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setSaving(true);
    await fetch(`/api/dj/feed-templates/${id}`, { method: 'DELETE' });
    router.push('/dj-controller');
  }

  if (loading) {
    return <div className={styles.loading}>Loading…</div>;
  }

  const isNew = !id;

  return (
    <>
      <Head>
        <title>{isNew ? 'New Template' : `Edit: ${name}`} — DJ Feed Editor</title>
      </Head>

      <div className={styles.page}>
        <div className={styles.topBar}>
          <Link href="/dj-controller" className={styles.backLink}>← Controller</Link>
          <h1 className={styles.title}>{isNew ? 'New Template' : 'Edit Template'}</h1>
          <button
            className={styles.previewBtn}
            disabled={saving}
            title={activeSession ? `Preview with live data from "${activeSession.name}"` : 'Preview template layout'}
            onClick={handlePreview}
          >
            Preview ↗
          </button>
        </div>

        <div className={styles.body}>
          {/* Sidebar: template meta + slide list */}
          <div className={styles.sidebar}>
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Template Name</span>
              <input
                className={styles.nameInput}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Template"
              />
            </div>

            <div className={styles.slideDivider} />

            <div className={styles.section}>
              <span className={styles.sectionLabel}>Designed For</span>
              <div className={styles.ratioButtons}>
                {ASPECT_RATIOS.map(r => (
                  <button
                    key={r.value}
                    className={`${styles.ratioBtn} ${designedFor === r.value ? styles.ratioBtnActive : ''}`}
                    onClick={() => setDesignedFor(r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.slideDivider} />

            <div className={styles.section}>
              <span className={styles.sectionLabel}>Slides</span>
              <div className={styles.slideList}>
                {slides.map((slide, idx) => (
                  <div
                    key={slide.id}
                    className={`${styles.slideRow} ${selectedSlideIdx === idx ? styles.slideRowActive : ''}`}
                    onClick={() => setSelectedSlideIdx(idx)}
                  >
                    <span className={styles.slideNum}>{idx + 1}</span>
                    <span className={styles.slideName}>{slide.name}</span>
                    <span className={styles.slideDur}>{slide.duration === 0 ? '—' : `${slide.duration}s`}</span>
                    <div className={styles.slideActions} onClick={e => e.stopPropagation()}>
                      <button className={styles.slideActionBtn} onClick={() => moveSlide(idx, -1)} disabled={idx === 0}>↑</button>
                      <button className={styles.slideActionBtn} onClick={() => moveSlide(idx, 1)} disabled={idx === slides.length - 1}>↓</button>
                      <button className={styles.slideActionBtnDanger} onClick={() => removeSlide(idx)} disabled={slides.length <= 1}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <button className={styles.addSlideBtn} onClick={addSlide}>+ Add Slide</button>
            </div>

            <div className={styles.actions}>
              {error && <p className={styles.errorMsg}>{error}</p>}
              {id && (
                <button
                  className={`${styles.deleteBtn} ${deleteConfirm ? styles.deleteBtnConfirm : ''}`}
                  onClick={handleDelete}
                  disabled={saving}
                >
                  {deleteConfirm ? 'Confirm Delete' : 'Delete Template'}
                </button>
              )}
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : id ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </div>

          {/* Main: selected slide editor */}
          {selectedSlide ? (
            <div className={styles.main}>
              <div className={styles.slideEditorHead}>
                <div className={styles.fieldGroup}>
                  <span className={styles.sectionLabel}>Slide Name</span>
                  <input
                    className={styles.nameInput}
                    value={selectedSlide.name}
                    onChange={e => updateSlide(selectedSlideIdx, { name: e.target.value })}
                    style={{ maxWidth: 260 }}
                  />
                </div>
                <div className={styles.inlineFields}>
                  <div className={styles.fieldGroup}>
                    <span className={styles.sectionLabel}>Duration (seconds)</span>
                    <input
                      className={styles.durationInput}
                      type="number"
                      min="0"
                      value={selectedSlide.duration}
                      onChange={e => updateSlide(selectedSlideIdx, { duration: Math.max(0, parseInt(e.target.value) || 0) })}
                    />
                    <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>0 = no slideshow</span>
                  </div>
                  <div className={styles.fieldGroup}>
                    <span className={styles.sectionLabel}>Grid Size</span>
                    <div className={styles.gridConfig}>
                      <input
                        className={styles.gridInput}
                        type="number"
                        min="1"
                        max="12"
                        value={selectedSlide.grid.cols}
                        onChange={e => updateSlide(selectedSlideIdx, { grid: { ...selectedSlide.grid, cols: Math.max(1, parseInt(e.target.value) || 1) } })}
                      />
                      <span className={styles.gridSep}>cols ×</span>
                      <input
                        className={styles.gridInput}
                        type="number"
                        min="1"
                        max="12"
                        value={selectedSlide.grid.rows}
                        onChange={e => updateSlide(selectedSlideIdx, { grid: { ...selectedSlide.grid, rows: Math.max(1, parseInt(e.target.value) || 1) } })}
                      />
                      <span className={styles.gridSep}>rows</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Visual canvas */}
              <div className={styles.canvasSection}>
                <span className={styles.sectionLabel}>Canvas Preview</span>
                <SlideCanvas slide={selectedSlide} designedFor={designedFor} />
              </div>

              {/* Elements */}
              <div className={styles.elementsSection}>
                <span className={styles.sectionLabel}>Elements</span>
                {selectedSlide.elements.map((el, elIdx) => {
                  const { cols, rows } = selectedSlide.grid;
                  const meta = ELEMENT_TYPES[el.type] ?? { label: el.type, icon: '?' };
                  const isChanging = changingEl?.slideIdx === selectedSlideIdx && changingEl?.elIdx === elIdx;
                  return (
                    <div key={el.id} className={styles.elementRow}>
                      <button
                        className={`${styles.elementTypeBtn} ${isChanging ? styles.elementTypeBtnActive : ''}`}
                        onClick={() => setChangingEl(isChanging ? null : { slideIdx: selectedSlideIdx, elIdx })}
                        title="Change element type"
                      >
                        <span className={styles.elementTypeBtnIcon}>{meta.icon}</span>
                        <span className={styles.elementTypeBtnLabel}>{meta.label}</span>
                        <span className={styles.elementTypeBtnCaret}>▾</span>
                      </button>
                      <div className={styles.elementPos}>
                        <label>Col</label>
                        <input type="number" min="1" max={cols} value={el.col} className={styles.posInput}
                          onChange={e => updateElement(selectedSlideIdx, elIdx, { col: Math.min(cols, Math.max(1, parseInt(e.target.value) || 1)) })} />
                        <label>Row</label>
                        <input type="number" min="1" max={rows} value={el.row} className={styles.posInput}
                          onChange={e => updateElement(selectedSlideIdx, elIdx, { row: Math.min(rows, Math.max(1, parseInt(e.target.value) || 1)) })} />
                        <label>W</label>
                        <input type="number" min="1" max={cols - el.col + 1} value={el.colSpan} className={styles.posInput}
                          onChange={e => updateElement(selectedSlideIdx, elIdx, { colSpan: Math.min(cols - el.col + 1, Math.max(1, parseInt(e.target.value) || 1)) })} />
                        <label>H</label>
                        <input type="number" min="1" max={rows - el.row + 1} value={el.rowSpan} className={styles.posInput}
                          onChange={e => updateElement(selectedSlideIdx, elIdx, { rowSpan: Math.min(rows - el.row + 1, Math.max(1, parseInt(e.target.value) || 1)) })} />
                      </div>
                      <button className={styles.removeElBtn} onClick={() => removeElement(selectedSlideIdx, elIdx)}>✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={styles.main}>
              <div className={styles.emptySlide}>No slide selected</div>
            </div>
          )}

          {/* Right elements panel — always visible */}
          <div className={styles.elementsPanel}>
            <div className={styles.elementsPanelHead}>
              <span className={styles.elementsPanelTitle}>
                {changingEl ? 'Change Type' : 'Elements'}
              </span>
              {changingEl && (
                <button className={styles.elementsPanelClose} onClick={() => setChangingEl(null)}>✕</button>
              )}
            </div>
            <div className={styles.elementsPanelList}>
              {Object.entries(ELEMENT_TYPES).map(([key, meta]) => (
                <button
                  key={key}
                  className={styles.elementsPanelCard}
                  onClick={() => handlePanelSelect(key)}
                >
                  <span className={styles.elementsPanelCardIcon}>{meta.icon}</span>
                  <span className={styles.elementsPanelCardText}>
                    <span className={styles.elementsPanelCardLabel}>{meta.label}</span>
                    <span className={styles.elementsPanelCardDesc}>{meta.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
