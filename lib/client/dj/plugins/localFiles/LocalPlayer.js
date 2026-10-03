import { remainingMs } from '../../autoAdvance';
import { audioPositionMs, tempoOf } from '../../../../dj/tempo';
import { shouldStartCrossfade, MANUAL_FADE_SEC } from './mixing';
import { DEFAULT_SETTINGS, IN_FADE_SEC, normalizeSettings, playLengthMs } from './trackSettings';
import { Deck } from './Deck';

// Re-seek only when the audio drifts this far from the queue's clock, so
// buffering jitter never causes an audible skip.
const DRIFT_TOLERANCE_S = 2;

const IDLE = Object.freeze({
  requestId: null, entry: null, sessionId: null,
  blocked: false, error: null, fadingOut: false,
  adjust: DEFAULT_SETTINGS, // the playing track's settings, as adjusted live
  saved: null,              // what's saved for the playing file (null = nothing)
  startOffset: 0,           // In point this play started from (the queue's clock counts from it)
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
 * Both play through one AudioContext (see Deck).
 *
 * Each file can carry saved settings (trackSettings.js): volume, an In point
 * (playback starts there, fading in) and an Out point (the fade/crossfade to
 * the next track starts there). The queue's clock counts from the In point.
 *
 * Callbacks:
 *   onFinished(requestId, sessionId) — a track finished: the audio ended, a
 *     crossfade/Out point was reached, or, for a request with no matching
 *     file, its duration elapsed. Advancing the queue (and calling sync with
 *     the new track) is the caller's job.
 *   onPlayLength(requestId, ms) — how long a loaded file will actually play
 *     (at normal speed), once its length is known or its settings change.
 *   onChange(state) — see IDLE for the shape.
 */
export class LocalPlayer {
  constructor({ onFinished, onChange, onPlayLength = () => {} }) {
    this.onFinished = onFinished;
    this.onChange = onChange;
    this.onPlayLength = onPlayLength;
    // { resolve(request) → entry|null, getFile(entry) → File|null, settingsFor(entry) → settings|null }
    this.library = null;
    this.state = IDLE;
    this.crossfadeSec = 0;
    this.upNext = null;
    this.pendingCrossfade = null; // { from: requestId, sec } — set just before finishing
    this.timer = null;
    this.seq = 0; // bumps on every sync/stop so stale async work can bail out

    this.context = new AudioContext();
    const deckEvents = {
      context: this.context,
      onEnded: deck => this.handleEnded(deck),
      onTimeUpdate: deck => { if (deck === this.active) this.checkTransitions(deck); },
      onMetadata: deck => this.reportPlayLength(deck),
      onError: deck => { if (deck === this.active) this.update({ error: 'This file could not be played.' }); },
    };
    this.active = new Deck(deckEvents);
    this.spare = new Deck(deckEvents);
  }

  // ── configuration ─────────────────────────────────────────────────────────

  setLibrary(library) {
    this.library = library;
    // Saved settings may have changed (e.g. the DJ just saved this track).
    if (this.active.entry) this.update({ saved: library?.settingsFor(this.active.entry) ?? null });
    this.preloadUpNext();
  }

  setCrossfade(sec) {
    this.crossfadeSec = sec;
    this.reportPlayLength(this.active); // the Out point's fade length changed
  }

  /** The request expected to play next; its file is preloaded on the spare deck. */
  setUpNext(request) {
    this.upNext = request ?? null;
    this.preloadUpNext();
  }

  async setOutputDevice(deviceId) {
    try {
      if (typeof this.context.setSinkId === 'function') await this.context.setSinkId(deviceId ?? '');
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
    if (!request) {
      // Reached the end of the queue on an Out point or Fade → Next: fade out
      // rather than cut off.
      const fadeSec = this.takeCrossfade();
      if (fadeSec && this.active.requestId) { this.swapDecks(fadeSec); this.update(IDLE); } else this.stop();
      return;
    }

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
        incoming.load(file, { requestId: request._id, entry, settings: this.settingsFor(entry) });
      }
      this.swapDecks(fadeSec);
      this.update({
        requestId: request._id, entry, sessionId, error: null, fadingOut: false,
        adjust: incoming.settings, saved: this.library.settingsFor(entry) ?? null,
        startOffset: incoming.startOffset,
      });
      // Fade in: over the crossfade, or briefly when starting past the intro.
      const fadeInSec = fadeSec || (incoming.startOffset > 0 ? IN_FADE_SEC : 0);
      if (fadeInSec) { incoming.setLevel(0); incoming.fadeTo(1, fadeInSec * 1000); }
    }

    const deck = this.active;
    deck.setRate(tempoOf(request));
    // The queue's clock counts from the track's In point.
    const target = deck.startOffset + audioPositionMs(request) / 1000;
    if (Math.abs(deck.audio.currentTime - target) > DRIFT_TOLERANCE_S) deck.audio.currentTime = target;

    if (request.pausedAt) {
      deck.audio.pause();
      if (this.spare.retiring) this.spare.unload(); // don't let a crossfade tail play on
      return;
    }
    // Back to full level after a fade-out-and-pause (but not mid-fade-in).
    if (!deck.isFading && deck.level < 1) deck.setLevel(1);
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

  // ── live adjustments to the playing track (saved separately) ─────────────

  /** Change the playing track's volume, in dB. */
  setVolumeDb(volumeDb) {
    const deck = this.active;
    if (!deck.entry) return;
    this.adjust({ volumeDb });
    deck.setTrimDb(deck.settings.volumeDb);
  }

  /**
   * Set the In point (seconds; null to clear). It applies the next time this
   * file plays — this play has already started.
   */
  setInPoint(sec) {
    if (!this.active.entry) return;
    this.adjust({ inSec: sec });
  }

  /**
   * Set the Out point (seconds; null to clear). Applies now: the fade starts
   * the next time playback crosses it.
   */
  setOutPoint(sec) {
    if (!this.active.entry) return;
    this.adjust({ outSec: sec });
  }

  /** Where the playing file is: { currentSec, durationSec }, or null when idle. */
  position() {
    const deck = this.active;
    if (!deck.entry) return null;
    return { currentSec: deck.audio.currentTime, durationSec: deck.audio.duration };
  }

  /**
   * Jump the playing file to `sec` at once. The caller moves the queue's
   * clock to match (see useLocalFilesPlugin.seekTo), so remotes follow.
   */
  seek(sec) {
    const deck = this.active;
    if (!deck.entry) return;
    deck.lastTime = undefined; // a jump is not a crossing of the Out point
    deck.audio.currentTime = sec;
  }

  /** Put the playing track back to its saved settings. */
  revertAdjustments() {
    const deck = this.active;
    if (!deck.entry) return;
    deck.settings = this.settingsFor(deck.entry);
    deck.setTrimDb(deck.settings.volumeDb);
    this.update({ adjust: deck.settings });
    this.reportPlayLength(deck);
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
    this.context.close().catch(() => {});
  }

  // ── internals ──────────────────────────────────────────────────────────────

  settingsFor(entry) {
    return normalizeSettings(this.library?.settingsFor(entry));
  }

  adjust(patch) {
    const deck = this.active;
    deck.settings = normalizeSettings({ ...deck.settings, ...patch });
    this.update({ adjust: deck.settings });
    this.reportPlayLength(deck);
  }

  async play(deck, seq) {
    try {
      // The audio context starts suspended until the page has had a click.
      if (this.context.state !== 'running') await this.context.resume().catch(() => {});
      await deck.audio.play();
      if (seq !== this.seq) return;
      const audible = this.context.state === 'running';
      if (audible === this.state.blocked) this.update({ blocked: !audible });
    } catch (err) {
      if (seq !== this.seq) return;
      // NotAllowedError: autoplay needs a click first (e.g. after a reload).
      // AbortError: a newer load() interrupted this play() — expected.
      if (err.name === 'NotAllowedError') this.update({ blocked: true });
      else if (err.name !== 'AbortError') this.update({ error: err.message });
    }
  }

  /** Fade length at an Out point: the crossfade if on, else a manual fade. */
  outFadeSec() {
    return this.crossfadeSec || MANUAL_FADE_SEC;
  }

  reportPlayLength(deck) {
    if (!deck.requestId) return;
    const ms = playLengthMs(deck.settings, deck.audio.duration, this.outFadeSec());
    if (ms) this.onPlayLength(deck.requestId, ms);
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
    this.update({ ...IDLE, requestId: request._id, sessionId, error });
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
    deck.load(file, { requestId: next._id, entry, settings: this.settingsFor(entry) });
  }

  /**
   * On each timeupdate of the playing deck: start the fade to the next track
   * when playback crosses the Out point, or, without one, when a crossfade
   * should start before the end. Crossing (not just being past) the Out point
   * means marking an Out point at the current position doesn't fade at once.
   */
  checkTransitions(deck) {
    const now = deck.audio.currentTime;
    const prev = deck.lastTime ?? now;
    deck.lastTime = now;
    if (this.pendingCrossfade || !this.state.requestId || deck.audio.paused) return;

    const out = deck.settings.outSec;
    if (out !== null) {
      if (prev < out && now >= out) {
        this.pendingCrossfade = { from: deck.requestId, sec: this.outFadeSec() };
        this.finish();
      }
      return;
    }

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
