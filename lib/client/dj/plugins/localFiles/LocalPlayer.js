import { elapsedMs, remainingMs } from '../../autoAdvance';

// Re-seek only when the audio drifts this far from the queue's clock, so
// buffering jitter never causes an audible skip.
const DRIFT_TOLERANCE_S = 2;

const IDLE = Object.freeze({ requestId: null, entry: null, sessionId: null, blocked: false, error: null });

/**
 * Plays the queue's current track from the DJ's music folder.
 *
 * The queue in the database is the source of truth: call sync() with the
 * playing request whenever it changes, and the audio follows its
 * playStartedAt / pausedAt. That is why the controller's existing pause,
 * restart, skip and ±time buttons (and a phone used as a remote) all work
 * without plugin-specific controls.
 *
 * When a track finishes — the audio ends, or, for a request with no matching
 * file, its duration elapses — onFinished(requestId, sessionId) is called;
 * advancing the queue is the caller's job.
 *
 * State reported through onChange:
 *   requestId — request loaded (null when idle)
 *   entry     — library entry being played, null if the request has no file
 *   sessionId — session that request belongs to
 *   blocked   — the browser refused to autoplay; call resume() from a click
 *   error     — last playback problem, if any
 */
export class LocalPlayer {
  constructor({ onFinished, onChange }) {
    this.onFinished = onFinished;
    this.onChange = onChange;
    this.library = null; // { resolve(request) → entry|null, getFile(entry) → File|null }
    this.state = IDLE;
    this.audio = null;
    this.objectUrl = null;
    this.timer = null;
    this.seq = 0; // bumps on every sync/stop so stale async work can bail out
  }

  setLibrary(library) {
    this.library = library;
  }

  /** Session whose track is loaded, or null when idle. */
  get sessionId() {
    return this.state.requestId ? this.state.sessionId : null;
  }

  /** Make playback match `request` (the session's playing request, or null). */
  async sync(request, sessionId) {
    const seq = ++this.seq;
    this.clearTimer();
    if (!request) { this.stop(); return; }

    const entry = this.library?.resolve(request) ?? null;
    if (!entry) { this.playWithoutFile(request, sessionId, null); return; }

    if (this.state.requestId !== request._id || this.state.entry?.key !== entry.key) {
      const file = await this.library.getFile(entry);
      if (seq !== this.seq) return;
      if (!file) { this.playWithoutFile(request, sessionId, `File not found: ${entry.key}`); return; }
      this.load(file);
      this.update({ requestId: request._id, entry, sessionId, error: null });
    }

    const audio = this.audio;
    const target = elapsedMs(request) / 1000;
    if (Math.abs(audio.currentTime - target) > DRIFT_TOLERANCE_S) audio.currentTime = target;

    if (request.pausedAt) { audio.pause(); return; }
    try {
      await audio.play();
      if (seq === this.seq && this.state.blocked) this.update({ blocked: false });
    } catch (err) {
      if (seq !== this.seq) return;
      // NotAllowedError: autoplay needs a click first (e.g. after a reload).
      // AbortError: a newer load() interrupted this play() — expected.
      if (err.name === 'NotAllowedError') this.update({ blocked: true });
      else if (err.name !== 'AbortError') this.update({ error: err.message });
    }
  }

  /** Retry playback after the browser blocked autoplay. Call from a click. */
  async resume() {
    if (!this.audio) return;
    try {
      await this.audio.play();
      this.update({ blocked: false });
    } catch (err) {
      this.update({ error: err.message });
    }
  }

  stop() {
    this.seq++;
    this.clearTimer();
    this.unload();
    this.update(IDLE);
  }

  dispose() {
    this.stop();
    this.audio = null;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /**
   * No file for this request: silence the player and advance when the
   * request's duration runs out, like the standard timer would.
   */
  playWithoutFile(request, sessionId, error) {
    this.unload();
    this.update({ requestId: request._id, entry: null, sessionId, blocked: false, error });
    if (!request.pausedAt) this.timer = setTimeout(() => this.finish(), remainingMs(request));
  }

  load(file) {
    this.unload();
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.addEventListener('ended', () => this.finish());
      this.audio.addEventListener('error', () => {
        if (this.objectUrl) this.update({ error: 'This file could not be played.' });
      });
    }
    this.objectUrl = URL.createObjectURL(file);
    this.audio.src = this.objectUrl;
  }

  unload() {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  finish() {
    this.clearTimer();
    const { requestId, sessionId } = this.state;
    if (requestId) this.onFinished(requestId, sessionId);
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  update(patch) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }
}
