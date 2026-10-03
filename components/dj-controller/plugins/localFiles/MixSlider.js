import { useState, useEffect, useRef } from 'react';
import s from './LocalFiles.module.css';

// Wait for the slider to settle before saving, so dragging it doesn't send a
// PATCH per pixel. `onPreview` (e.g. the local audio) follows immediately.
const SAVE_DELAY_MS = 400;

/**
 * A −/slider/+ row for a value stored on the playing request (tempo, volume).
 * Follows changes made on other devices unless the DJ is mid-drag here.
 * Clicking the value resets it. Key it by request id so an unsaved drag
 * never lands on the next song.
 */
export default function MixSlider({
  label, value, min, max, step, nudge = step, format, resetValue, resetTitle,
  onPreview, onCommit, large = false,
}) {
  const [current, setCurrent] = useState(value);
  const saveTimer = useRef(null);

  useEffect(() => {
    if (!saveTimer.current) setCurrent(value);
  }, [value]);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  function change(next) {
    const v = Math.min(max, Math.max(min, Math.round(next / step) * step));
    setCurrent(v);
    onPreview?.(v);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      onCommit(v);
    }, SAVE_DELAY_MS);
  }

  return (
    <div className={`${s.row} ${large ? s.mixLarge : ''}`}>
      <span className={s.deckLabel}>{label}</span>
      <button className={s.ghostBtn} onClick={() => change(current - nudge)} disabled={current <= min} aria-label={`${label} down`}>−</button>
      <input
        type="range"
        className={s.slider}
        min={min} max={max} step={step}
        value={current}
        onChange={e => change(Number(e.target.value))}
        aria-label={label}
      />
      <button className={s.ghostBtn} onClick={() => change(current + nudge)} disabled={current >= max} aria-label={`${label} up`}>+</button>
      <button
        className={`${s.ghostBtn} ${s.tempoValue}`}
        onClick={() => change(resetValue)}
        disabled={current === resetValue}
        title={resetTitle}
      >
        {format(current)}
      </button>
    </div>
  );
}
