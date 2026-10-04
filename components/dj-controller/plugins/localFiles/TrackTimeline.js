import { useState, useEffect, useMemo, useRef } from 'react';
import s from './LocalFiles.module.css';
import { soundBounds, snap } from '../../../../lib/client/dj/plugins/localFiles/waveform';
import { MIN_PLAY_SEC } from '../../../../lib/client/dj/plugins/localFiles/trackSettings';
import { MANUAL_FADE_SEC } from '../../../../lib/client/dj/plugins/localFiles/mixing';

// SVG coordinate space; stretched to the panel's width.
const W = 1000;
const H = 100;
// How close (px) the pointer must be to grab a handle, and to snap to where the sound starts/ends.
const GRAB_PX = 18;
const SNAP_PX = 12;
// "Move playhead" re-locks itself if not used within this long.
const SEEK_ARM_MS = 8000;
// Width of the grab tabs on the handles, in SVG units (of W).
const TAB_W = 10;

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(1).padStart(4, '0')}`;
}

/** Mirrored bars, one per peak, as a single SVG path. */
function waveformPath(peaks) {
  const n = peaks.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * W;
    const h = Math.max(0.5, peaks[i] * (H / 2 - 2));
    d += `M${x.toFixed(1)} ${(H / 2 - h).toFixed(1)}V${(H / 2 + h).toFixed(1)}`;
  }
  return d;
}

/**
 * The playing track as a waveform: drag the In (start) and Out (fade start)
 * handles to set them. Handles snap to where the sound starts and ends.
 * Regions that won't play are dimmed, and the fade after Out is shaded.
 *
 * Built for use mid-set: clicking the waveform does nothing (only the handles
 * respond), and jumping the playhead needs "Move playhead" first.
 */
export default function TrackTimeline({ runtime, request }) {
  const { playback } = runtime;
  const entry = playback.entry;
  const [wave, setWave] = useState(null);
  const [failed, setFailed] = useState(false);
  const [drag, setDrag] = useState(null); // { which: 'in' | 'out', sec }
  const [hover, setHover] = useState(null); // 'in' | 'out' | null — for the cursor
  // Jumping the playhead cuts into the music, so it never happens on a stray
  // click: the DJ arms it first, and it re-locks after one jump (or a timeout).
  const [seekArmed, setSeekArmed] = useState(false);
  const svgRef = useRef(null);
  const playheadRef = useRef(null);
  const positionRef = useRef(playback.position);
  positionRef.current = playback.position;

  // Load (or decode) this file's waveform.
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setWave(null);
    setFailed(false);
    runtime.waveformFor(entry)
      .then(w => { if (!cancelled) setWave(w); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // Reload only when the file changes (runtime is a new object every render).
  }, [entry?.key]);

  const durationSec = wave?.durationSec || 0;
  const bounds = useMemo(() => (wave ? soundBounds(wave.peaks, durationSec) : null), [wave, durationSec]);
  const path = useMemo(() => (wave ? waveformPath(wave.peaks) : ''), [wave]);

  useEffect(() => {
    if (!seekArmed) return;
    const t = setTimeout(() => setSeekArmed(false), SEEK_ARM_MS);
    return () => clearTimeout(t);
  }, [seekArmed]);

  // Move the playhead every frame without re-rendering.
  useEffect(() => {
    if (!durationSec) return;
    let frame;
    const tick = () => {
      const pos = positionRef.current();
      if (playheadRef.current && pos) {
        const x = Math.min(W, Math.max(0, (pos.currentSec / durationSec) * W));
        playheadRef.current.setAttribute('x1', x);
        playheadRef.current.setAttribute('x2', x);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationSec]);

  if (failed) return <p className={s.hint}>Couldn't draw this track's waveform.</p>;
  if (!wave) return <p className={s.hint}>Reading waveform…</p>;

  const fadeSec = playback.crossfadeSec || MANUAL_FADE_SEC;
  const inSec = drag?.which === 'in' ? drag.sec : (playback.adjust.inSec ?? 0);
  const outSec = drag?.which === 'out' ? drag.sec : playback.adjust.outSec; // null = near the end
  const toX = sec => (sec / durationSec) * W;
  const inX = toX(inSec);
  const outX = outSec !== null ? toX(outSec) : null;
  const fadeEndX = outX !== null ? Math.min(W, toX(outSec + fadeSec)) : null;

  const pxToSec = px => (px / (svgRef.current?.getBoundingClientRect().width || 1)) * durationSec;
  const secAt = e => {
    const rect = svgRef.current.getBoundingClientRect();
    return Math.min(durationSec, Math.max(0, ((e.clientX - rect.left) / rect.width) * durationSec));
  };
  const handleNear = sec => {
    const tol = pxToSec(GRAB_PX);
    if (Math.abs(sec - inSec) <= tol) return 'in';
    if (Math.abs(sec - (outSec ?? durationSec)) <= tol) return 'out';
    return null;
  };
  // Keep at least MIN_PLAY_SEC between the handles, and snap to the sound's edges.
  const place = (which, raw) => {
    const snapped = snap(raw, [0, bounds.startSec, bounds.endSec, durationSec], pxToSec(SNAP_PX));
    return which === 'in'
      ? Math.min(snapped, (outSec ?? durationSec) - MIN_PLAY_SEC)
      : Math.max(snapped, inSec + MIN_PLAY_SEC);
  };

  const onPointerDown = e => {
    const sec = secAt(e);
    if (seekArmed) {
      setSeekArmed(false);
      runtime.seekTo(request, sec);
      return;
    }
    // Only the handles respond: a click anywhere else does nothing.
    const which = handleNear(sec);
    if (!which) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ which, sec: place(which, sec) });
  };
  const onPointerMove = e => {
    const sec = secAt(e);
    if (drag) setDrag({ which: drag.which, sec: place(drag.which, sec) });
    else if (!seekArmed) setHover(handleNear(sec));
  };
  const onPointerUp = () => {
    if (!drag) return;
    // At the very start / end, a handle means "no point set".
    if (drag.which === 'in') playback.setInPoint(drag.sec <= 0.05 ? null : drag.sec);
    else playback.setOutPoint(drag.sec >= durationSec - 0.5 ? null : drag.sec);
    setDrag(null);
  };

  return (
    <div className={s.timeline}>
      <svg
        ref={svgRef}
        className={s.timelineSvg}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ cursor: seekArmed ? 'crosshair' : drag || hover ? 'ew-resize' : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => !drag && setHover(null)}
        role="group"
        aria-label="Track timeline: drag the Start and Fade handles"
      >
        <defs>
          <linearGradient id="fadeShade" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="rgba(0,0,0,0)" />
            <stop offset="1" stopColor="rgba(0,0,0,0.6)" />
          </linearGradient>
        </defs>
        <path d={path} className={s.timelineWave} vectorEffect="non-scaling-stroke" />
        {/* Won't play: before In, and after the fade that follows Out. */}
        {inX > 0 && <rect x="0" y="0" width={inX} height={H} className={s.timelineDim} />}
        {outX !== null && <rect x={outX} y="0" width={Math.max(0, fadeEndX - outX)} height={H} fill="url(#fadeShade)" />}
        {fadeEndX !== null && fadeEndX < W && <rect x={fadeEndX} y="0" width={W - fadeEndX} height={H} className={s.timelineDim} />}
        {/* Where the sound starts and ends (snap targets). */}
        <line x1={toX(bounds.startSec)} x2={toX(bounds.startSec)} y1="0" y2={H} className={s.timelineBound} vectorEffect="non-scaling-stroke" />
        <line x1={toX(bounds.endSec)} x2={toX(bounds.endSec)} y1="0" y2={H} className={s.timelineBound} vectorEffect="non-scaling-stroke" />
        {/* Handles */}
        <line x1={inX} x2={inX} y1="0" y2={H} className={s.timelineIn} vectorEffect="non-scaling-stroke" />
        <rect x={Math.max(0, inX)} y="0" width={TAB_W} height={H * 0.3} className={`${s.timelineTab} ${s.timelineTabIn} ${hover === 'in' || drag?.which === 'in' ? s.timelineTabActive : ''}`} />
        <line x1={outX ?? W} x2={outX ?? W} y1="0" y2={H} className={s.timelineOut} vectorEffect="non-scaling-stroke" />
        <rect x={Math.min(W, outX ?? W) - TAB_W} y="0" width={TAB_W} height={H * 0.3} className={`${s.timelineTab} ${s.timelineTabOut} ${hover === 'out' || drag?.which === 'out' ? s.timelineTabActive : ''}`} />
        <line ref={playheadRef} x1="0" x2="0" y1="0" y2={H} className={s.timelinePlayhead} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className={s.timelineLegend}>
        <span className={s.timelineInLabel}>
          ▶ Start {inSec > 0 ? formatTime(inSec) : 'at beginning'}
          {inSec > 0 && !drag && <button className={s.linkBtn} onClick={() => playback.setInPoint(null)}>reset</button>}
        </span>
        <button
          className={`${s.linkBtn} ${seekArmed ? s.seekArmed : ''}`}
          onClick={() => setSeekArmed(a => !a)}
          title="Jumping cuts into the music, so it takes two steps: press this, then click where to jump"
        >
          {seekArmed ? 'Click the waveform to jump · cancel' : '⇥ Move playhead'}
        </button>
        <span className={s.timelineOutLabel}>
          Fade {outSec !== null ? formatTime(outSec) : 'near the end'} ◀
          {outSec !== null && !drag && <button className={s.linkBtn} onClick={() => playback.setOutPoint(null)}>reset</button>}
        </span>
      </div>
      <span className={s.muted}>
        Sound {formatTime(bounds.startSec)}–{formatTime(bounds.endSec)} of {formatTime(durationSec)}
        {inSec > 0 && ' · Restart (or the next play) starts here'}
      </span>
    </div>
  );
}
