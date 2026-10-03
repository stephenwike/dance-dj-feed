import { fadeVolume, secondsLeft } from './mixing';
import { dbToGain, DEFAULT_SETTINGS } from './trackSettings';

// Fade curves are sampled this often (ms); the audio engine interpolates between.
const FADE_CURVE_STEP_MS = 20;
// Volume changes glide over roughly this long (s) instead of clicking.
const TRIM_SMOOTHING_S = 0.05;

/**
 * One audio element plus the request/file it holds. LocalPlayer uses two so
 * the next track can be preloaded and crossfaded in.
 *
 * Audio runs through Web Audio: element → trim (the track's saved loudness,
 * which can boost as well as cut) → fader (fades and crossfades, scheduled by
 * the audio engine) → the shared AudioContext's output.
 */
export class Deck {
  constructor({ context, onEnded, onTimeUpdate, onError, onMetadata }) {
    this.context = context;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.preservesPitch = true; // tempo changes speed, not key
    this.audio.addEventListener('ended', () => onEnded(this));
    this.audio.addEventListener('timeupdate', () => onTimeUpdate(this));
    this.audio.addEventListener('loadedmetadata', () => onMetadata(this));
    this.audio.addEventListener('error', () => { if (this.objectUrl) onError(this); });

    this.trim = context.createGain();
    this.fader = context.createGain();
    context.createMediaElementSource(this.audio).connect(this.trim).connect(this.fader).connect(context.destination);

    this.requestId = null;
    this.entry = null;
    this.settings = DEFAULT_SETTINGS; // saved/adjusted for this track (trackSettings.js)
    this.startOffset = 0;             // In point in effect for this play (fixed once loaded)
    this.objectUrl = null;
    this.fadeTimer = null;
    this.resolveFade = null;
    this.retiring = false; // fading out a track that is no longer current
  }

  holds(requestId, entry) {
    return !!requestId && this.requestId === requestId && this.entry?.key === entry?.key;
  }

  load(file, { requestId, entry, settings = DEFAULT_SETTINGS }) {
    this.unload();
    this.objectUrl = URL.createObjectURL(file);
    this.audio.src = this.objectUrl;
    this.requestId = requestId;
    this.entry = entry;
    this.settings = settings;
    this.startOffset = settings.inSec ?? 0;
    this.lastTime = undefined; // for LocalPlayer's Out-point crossing check
    this.setTrimDb(settings.volumeDb);
    this.setLevel(1);
  }

  unload() {
    this.cancelFade();
    this.retiring = false;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.requestId = null;
    this.entry = null;
    this.settings = DEFAULT_SETTINGS;
    this.startOffset = 0;
    this.lastTime = undefined;
  }

  setRate(rate) {
    if (this.audio.playbackRate !== rate) this.audio.playbackRate = rate;
  }

  setTrimDb(db) {
    this.trim.gain.setTargetAtTime(dbToGain(db), this.context.currentTime, TRIM_SMOOTHING_S);
  }

  get secondsLeft() {
    return secondsLeft(this.audio);
  }

  /** Fader level, 0..1. */
  get level() {
    return this.fader.gain.value;
  }

  /** Jump the fader to `value`, cancelling any fade. */
  setLevel(value) {
    this.cancelFade();
    const g = this.fader.gain;
    const t = this.context.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(value, t);
  }

  get isFading() {
    return !!this.fadeTimer;
  }

  /**
   * Fade the fader to `to` over `ms` along an equal-power curve. Resolves
   * true when the fade completes, false if it was cancelled (by another fade,
   * setLevel, unload, or cancelFade).
   */
  fadeTo(to, ms) {
    this.cancelFade();
    const g = this.fader.gain;
    const from = g.value;
    if (ms <= 0) { this.setLevel(to); return Promise.resolve(true); }
    const points = Math.max(2, Math.ceil(ms / FADE_CURVE_STEP_MS));
    const curve = new Float32Array(points);
    for (let i = 0; i < points; i++) curve[i] = fadeVolume(from, to, i / (points - 1));
    const t = this.context.currentTime;
    g.cancelScheduledValues(t);
    g.setValueCurveAtTime(curve, t, ms / 1000);
    return new Promise(resolve => {
      this.resolveFade = resolve;
      this.fadeTimer = setTimeout(() => {
        this.fadeTimer = null;
        this.resolveFade = null;
        resolve(true);
      }, ms);
    });
  }

  cancelFade() {
    if (!this.fadeTimer) return;
    clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
    // Hold the fader where the fade had got to.
    const g = this.fader.gain;
    const t = this.context.currentTime;
    if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(t);
    else { const v = g.value; g.cancelScheduledValues(t); g.setValueAtTime(v, t); }
    const resolve = this.resolveFade;
    this.resolveFade = null;
    resolve?.(false);
  }
}
