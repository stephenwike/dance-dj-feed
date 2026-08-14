import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { ASPECT_RATIOS, DEFAULT_TEMPLATE, templateWarnings } from '../../lib/client/dj/feedTemplates';

const fetcher = url => fetch(url).then(r => r.json());

export default function FeedConfigPanel({ activeSession, feedAspectRatio = '16:9', feedTemplateId = 'default', setFeedAspectRatio, setFeedTemplateId, applyFeedTemplate }) {
  const router = useRouter();
  const wrapRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(320);
  const [deleteId, setDeleteId] = useState(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [applyState, setApplyState] = useState('idle'); // idle | applying | applied

  async function handleApply() {
    setApplyState('applying');
    await applyFeedTemplate?.();
    setIframeKey(k => k + 1);
    setApplyState('applied');
    setTimeout(() => setApplyState('idle'), 2000);
  }

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { data: userTemplates = [], mutate: mutateTemplates } = useSWR('/api/dj/feed-templates', fetcher);

  const currentRatio = ASPECT_RATIOS.find(r => r.value === feedAspectRatio) ?? ASPECT_RATIOS[0];
  const scale = containerWidth / currentRatio.w;
  const previewHeight = Math.round(currentRatio.h * scale);

  const allTemplates = [DEFAULT_TEMPLATE, ...userTemplates];
  const activeTemplate = allTemplates.find(t => t.id === feedTemplateId) ?? DEFAULT_TEMPLATE;
  const warnings = templateWarnings(activeTemplate, feedAspectRatio);

  async function handleForkDefault() {
    const res = await fetch('/api/dj/feed-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Default (Copy)',
        designedFor: DEFAULT_TEMPLATE.designedFor,
        slides: DEFAULT_TEMPLATE.slides,
      }),
    });
    const created = await res.json();
    mutateTemplates();
    router.push(`/dj-feed-editor?id=${created.id}`);
  }

  async function handleDelete(id) {
    if (deleteId !== id) { setDeleteId(id); return; }
    await fetch(`/api/dj/feed-templates/${id}`, { method: 'DELETE' });
    if (feedTemplateId === id && setFeedTemplateId) setFeedTemplateId('default');
    mutateTemplates();
    setDeleteId(null);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Feed</span>
        <div className={styles.ratioButtons}>
          {ASPECT_RATIOS.map(r => (
            <button
              key={r.value}
              className={`${styles.ratioBtn} ${feedAspectRatio === r.value ? styles.ratioBtnActive : ''}`}
              onClick={() => setFeedAspectRatio?.(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className={styles.feedPreviewWrap} style={{ height: previewHeight }}>
        {activeSession ? (
          <iframe
            key={iframeKey}
            src={`/feed-preview?templateId=${feedTemplateId}&sessionId=${activeSession._id}`}
            title="Feed Preview"
            style={{
              width: currentRatio.w,
              height: currentRatio.h,
              border: 'none',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <div className={styles.feedPreviewEmpty}>Start a session to preview the feed</div>
        )}
      </div>

      <div className={styles.feedConfigBody}>
        {warnings.map((w, i) => (
          <div key={i} className={styles.feedWarning}>⚠ {w}</div>
        ))}

        <div className={styles.feedSectionLabel}>Template</div>
        <div className={styles.feedTemplateList}>
          {allTemplates.map(t => (
            <div
              key={t.id}
              className={`${styles.feedTemplateRow} ${feedTemplateId === t.id ? styles.feedTemplateRowActive : ''}`}
              onClick={() => setFeedTemplateId?.(t.id)}
            >
              <div className={styles.feedTemplateInfo}>
                <span className={styles.feedTemplateName}>{t.name}</span>
                <span className={styles.feedTemplateMeta}>
                  {t.isDefault ? 'Built-in' : `${t.slides?.length ?? 0} slide${t.slides?.length !== 1 ? 's' : ''}`}
                </span>
              </div>
              <div className={styles.feedTemplateActions} onClick={e => e.stopPropagation()}>
                {t.isDefault ? (
                  <button className={styles.feedTemplateBtn} onClick={handleForkDefault} title="Create an editable copy">
                    Fork
                  </button>
                ) : (
                  <>
                    <button className={styles.feedTemplateBtn} onClick={() => router.push(`/dj-feed-editor?id=${t.id}`)}>
                      Edit
                    </button>
                    <button
                      className={`${styles.feedTemplateBtn} ${deleteId === t.id ? styles.feedTemplateBtnDanger : ''}`}
                      onClick={() => handleDelete(t.id)}
                    >
                      {deleteId === t.id ? 'Sure?' : '✕'}
                    </button>
                  </>
                )}
              </div>
              {feedTemplateId === t.id && <span className={styles.feedTemplateCheck}>✓</span>}
            </div>
          ))}
          <button className={styles.feedNewTemplateBtn} onClick={() => router.push('/dj-feed-editor')}>
            + New Template
          </button>
        </div>

        <button
          className={styles.feedApplyBtn}
          onClick={handleApply}
          disabled={applyState !== 'idle' || !activeSession}
        >
          {applyState === 'applying' ? 'Applying…' : applyState === 'applied' ? '✓ Applied' : 'Apply to Live Feed'}
        </button>

        <div className={styles.feedSectionLabel}>
          Slides
          {activeTemplate.isDefault && <span className={styles.feedLockedHint}> — fork to edit</span>}
        </div>
        <div className={styles.feedSlideList}>
          {activeTemplate.slides.map((slide, idx) => (
            <div key={slide.id} className={styles.feedSlideRow}>
              <span className={styles.feedSlideNum}>{idx + 1}</span>
              <span className={styles.feedSlideName}>{slide.name}</span>
              <span className={styles.feedSlideDur}>
                {slide.duration === 0 ? 'Only slide' : `${slide.duration}s`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
