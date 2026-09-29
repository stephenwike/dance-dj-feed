import { remainingMs } from '../../autoAdvance';
import { audioPositionMs, tempoOf } from '../../../../dj/tempo';
import { shouldStartCrossfade } from './mixing';
import { Deck } from './Deck';

// Re-seek only when the audio drifts this far from the queue's clock, so
// buffering jitter never causes an audible skip.
const DRIFT_TOLERANCE_S = 2;

const IDLE = Object.freeze({
  requestId: null, entry: null, sessionId: null,
  blocked: false, error: null, fadingOut: false,
});

/**
 * Plays the queue's current track from the DJ's music folder.
 *
 * The queue in the database is the source of truth: call sync() with the
 * playing request whenever it changes, and the audio follows its
 * playStartedAt / pausedAt / tempo. That is why the controller's existing
 * pause, restart, skip and ±time buttons (and a phone used as a remote) all
 * work without plugin-specific controls.
 *
 * Two decks: the active one plays the current track; the other preloads the
 * next track (setUpNext) and, during a crossfade, carries the outgoing one.
 *
 * When a track finishes — the audio ends, a crossfade starts, or, for a
 * request with no matching file, its duration elapses — onFinished(requestId,
 * sessionId) is called; advancing the queue (and calling sync with the new
 * track) is the caller's job.
 *
 * State reported through onChange:
 *   requestId — request loaded (null when idle)
 *   entry     — library entry being played, null if the request has no file
 *   sessionId — session that request belongs to
 *   blocked   — the browser refused to autoplay; call resume() from a click
 *   error     — last playback problem, if any
 *   fadingOut — a manual fade out is in progress
 */
export class LocalPlayer {
  constructor({ onFinished, onChange }) {
    this.onFinished = onFinished;
    this.onChange = onChange;
    this.library = null; // { resolve(request) → entry|null, getFile(entry) → File|null }
    this.state = IDLE;
    this.crossfadeSec = 0;
    this.outputDeviceId = null;
    this.upNext = null;
    this.pendingCrossfade = null; // { from: requestId, sec } — set just before finishing
    this.timer = null;
    this.seq = 0; // bumps on every sync/stop so stale async work can bail out

    const deckEvents = {
      onEnded: deck => this.handleEnded(deck),
      onTimeUpdate: deck => { if (deck === this.active) this.maybeStartCrossfade(); },
      onError: deck => { if (deck === this.active) this.update({ error: 'This file could not be played.' }); },
    };
    this.active = new Deck(deckEvents);
    this.spare = new Deck(deckEvents);
  }

  // ── configuration ─────────────────────────────────────────────────────────

  setLibrary(library) {
    this.library = library;
    this.preloadUpNext();
  }

  setCrossfade(sec) {
    this.crossfadeSec = sec;
  }

  /** The request expected to play next; its file is preloaded on the spare deck. */
  setUpNext(request) {
    this.upNext = request ?? null;
    this.preloadUpNext();
  }

  async setOutputDevice(deviceId) {
    this.outputDeviceId = deviceId;
    try {
      await Promise.all([this.active.setOutputDevice(deviceId), this.spare.setOutputDevice(deviceId)]);
    } catch (err) {
      this.update({ error: `Couldn't switch speakers: ${err.message}` });
    }
  }

  /** Session whose track is loaded, or null when idle. */
  get sessionId() {
    return this.state.requestId ? this.state.sessionId : null;
  }

  // ── playback ──────────────────────────────────────────────────────────────

  /** Make playback match `request` (the session's playing request, or null). */
  async sync(request, sessionId) {
    const seq = ++this.seq;
    this.clearTimer();
    if (!request) { this.stop(); return; }

    const entry = this.library?.resolve(request) ?? null;
    const isNewTrack = !this.active.holds(request._id, entry);
    const fadeSec = isNewTrack ? this.takeCrossfade() : 0;
    if (!isNewTrack) this.pendingCrossfade = null;

    if (!entry) { this.playWithoutFile(request, sessionId, null, fadeSec); return; }

    if (isNewTrack) {
      const incoming = this.spare;
      if (!incoming.holds(request._id, entry)) {
        const file = await this.library.getFile(entry);
        if (seq !== this.seq) return;
        if (!file) { this.playWithoutFile(request, sessionId, `File not found: ${entry.key}`, fadeSec); return; }
        incoming.load(file, { requestId: request._id, entry });
      }
      this.swapDecks(fadeSec);
      this.update({ requestId: request._id, entry, sessionId, error: null, fadingOut: false });
      if (fadeSec) { incoming.audio.volume = 0; incoming.fadeTo(1, fadeSec * 1000); }
    }

    const deck = this.active;
    deck.setRate(tempoOf(request));
    const target = audioPositionMs(request) / 1000;
    if (Math.abs(deck.audio.currentTime - target) > DRIFT_TOLERANCE_S) deck.audio.currentTime = target;

    if (request.pausedAt) {
      deck.audio.pause();
      if (this.spare.retiring) this.spare.unload(); // don't let a crossfade tail play on
      return;
    }
    // Back to full volume after a fade-out-and-pause (but not mid-fade-in).
    if (!deck.isFading && deck.audio.volume < 1) deck.audio.volume = 1;
    await this.play(deck, seq);
    this.preloadUpNext();
  }

  /** Crossfade into the next track now (the DJ's Fade → Next). */
  fadeToNext(sec) {
    if (!this.state.requestId) return;
    this.pendingCrossfade = { from: this.state.requestId, sec };
    this.finish();
  }

  /**
   * Fade the current track to silence and pause it. Resolves true when done
   * (the caller then records the pause in the queue), false if interrupted.
   */
  async fadeOut(sec) {
    const deck = this.active;
    if (!deck.requestId) return false;
    this.update({ fadingOut: true });
    const done = await deck.fadeTo(0, sec * 1000);
    if (done) deck.audio.pause();
    this.update({ fadingOut: false });
    return done;
  }

  /** Apply a tempo immediately, ahead of the queue PATCH catching up. */
  previewTempo(tempo) {
    this.active.setRate(tempo);
  }

  /** Retry playback after the browser blocked autoplay. Call from a click. */
  async resume() {
    await this.play(this.active, this.seq);
  }

  stop() {
    this.seq++;
    this.clearTimer();
    this.pendingCrossfade = null;
    this.active.unload();
    this.spare.unload();
    this.update(IDLE);
  }

  dispose() {
    this.stop();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  async play(deck, seq) {
    try {
      await deck.audio.play();
      if (seq === this.seq && this.state.blocked) this.update({ blocked: false });
    } catch (err) {
      if (seq !== this.seq) return;
      // NotAllowedError: autoplay needs a click first (e.g. after a reload).
      // AbortError: a newer load() interrupted this play() — expected.
      if (err.name === 'NotAllowedError') this.update({ blocked: true });
      else if (err.name !== 'AbortError') this.update({ error: err.message });
    }
  }

  /** Crossfade seconds for the track change about to happen (0 = cut). */
  takeCrossfade() {
    const pending = this.pendingCrossfade;
    this.pendingCrossfade = null;
    return pending && pending.from === this.active.requestId ? pending.sec : 0;
  }

  /** The spare deck becomes active; the old active track fades out or stops. */
  swapDecks(fadeSec) {
    const outgoing = this.active;
    this.active = this.spare;
    this.spare = outgoing;
    this.retire(outgoing, fadeSec);
  }

  retire(deck, fadeSec) {
    if (!deck.requestId) return;
    if (!fadeSec || deck.audio.paused) { deck.unload(); return; }
    deck.retiring = true;
    deck.fadeTo(0, fadeSec * 1000).then(done => {
      if (!done) return;
      deck.unload();
      this.preloadUpNext(); // the deck is free again
    });
  }

  /**
   * No file for this request: silence the player and advance when the
   * request's duration runs out, like the standard timer would.
   */
  playWithoutFile(request, sessionId, error, fadeSec) {
    if (this.active.requestId) {
      // Keep the outgoing track on the spare deck so it can fade out.
      if (this.spare.requestId) this.spare.unload();
      this.swapDecks(fadeSec);
    }
    this.update({ requestId: request._id, entry: null, sessionId, blocked: false, error, fadingOut: false });
    if (!request.pausedAt) this.timer = setTimeout(() => this.finish(), remainingMs(request));
  }

  async preloadUpNext() {
    const next = this.upNext;
    const deck = this.spare;
    if (!next || !this.library || deck.retiring || next._id === this.active.requestId) return;
    const entry = this.library.resolve(next);
    if (!entry || deck.holds(next._id, entry)) return;
    const seq = this.seq;
    const file = await this.library.getFile(entry).catch(() => null);
    // Bail if playback moved on, or the deck got used, while the file was read.
    if (!file || seq !== this.seq || deck !== this.spare || deck.retiring) return;
    deck.load(file, { requestId: next._id, entry });
  }

  maybeStartCrossfade() {
    const deck = this.active;
    if (this.pendingCrossfade || !this.state.requestId || deck.audio.paused) return;
    const nextReady = !!this.upNext && this.spare.requestId === this.upNext._id;
    if (shouldStartCrossfade({
      crossfadeSec: this.crossfadeSec,
      secondsLeft: deck.secondsLeft,
      duration: deck.audio.duration,
      nextReady,
    })) {
      this.pendingCrossfade = { from: deck.requestId, sec: this.crossfadeSec };
      this.finish();
    }
  }

  handleEnded(deck) {
    if (deck === this.active) this.finish();
    else deck.unload(); // an outgoing track ran out mid-crossfade
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
