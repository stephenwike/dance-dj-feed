import { fadeVolume, secondsLeft } from './mixing';

const FADE_STEP_MS = 40;

/**
 * One audio element plus the request/file it holds. LocalPlayer uses two so
 * the next track can be preloaded and crossfaded in.
 */
export class Deck {
  constructor({ onEnded, onTimeUpdate, onError }) {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.preservesPitch = true; // tempo changes speed, not key
    this.audio.addEventListener('ended', () => onEnded(this));
    this.audio.addEventListener('timeupdate', () => onTimeUpdate(this));
    this.audio.addEventListener('error', () => { if (this.objectUrl) onError(this); });
    this.requestId = null;
    this.entry = null;
    this.objectUrl = null;
    this.fadeTimer = null;
    this.retiring = false; // fading out a track that is no longer current
  }

  holds(requestId, entry) {
    return !!requestId && this.requestId === requestId && this.entry?.key === entry?.key;
  }

  load(file, { requestId, entry }) {
    this.unload();
    this.objectUrl = URL.createObjectURL(file);
    this.audio.src = this.objectUrl;
    this.audio.volume = 1;
    this.requestId = requestId;
    this.entry = entry;
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
  }

  setRate(rate) {
    if (this.audio.playbackRate !== rate) this.audio.playbackRate = rate;
  }

  async setOutputDevice(deviceId) {
    if (typeof this.audio.setSinkId === 'function') await this.audio.setSinkId(deviceId ?? '');
  }

  get secondsLeft() {
    return secondsLeft(this.audio);
  }

  get isFading() {
    return !!this.fadeTimer;
  }

  /**
   * Ramp the volume to `to` over `ms`. Resolves true when the fade completes,
   * false if it was cancelled (by another fade, unload, or cancelFade).
   */
  fadeTo(to, ms) {
    this.cancelFade();
    const from = this.audio.volume;
    const start = performance.now();
    return new Promise(resolve => {
      this.resolveFade = resolve;
      this.fadeTimer = setInterval(() => {
        const p = ms > 0 ? (performance.now() - start) / ms : 1;
        this.audio.volume = fadeVolume(from, to, p);
        if (p >= 1) {
          this.clearFadeTimer();
          resolve(true);
        }
      }, FADE_STEP_MS);
    });
  }

  cancelFade() {
    if (!this.fadeTimer) return;
    this.clearFadeTimer();
    this.resolveFade?.(false);
  }

  clearFadeTimer() {
    clearInterval(this.fadeTimer);
    this.fadeTimer = null;
    this.resolveFade = null;
  }
}
