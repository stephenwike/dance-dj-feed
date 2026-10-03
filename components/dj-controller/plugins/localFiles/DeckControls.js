import { useState, useEffect, useRef } from 'react';
import s from './LocalFiles.module.css';
import { TEMPO_MIN, TEMPO_MAX, tempoOf } from '../../../../lib/dj/tempo';
import { CROSSFADE_OPTIONS, MANUAL_FADE_SEC } from '../../../../lib/client/dj/plugins/localFiles/mixing';
import { VOLUME_MIN_DB, VOLUME_MAX_DB } from '../../../../lib/client/dj/plugins/localFiles/trackSettings';
import TrackTimeline from './TrackTimeline';

// Wait for the slider to settle before saving, so dragging it doesn't send
// a PATCH per pixel. The audio follows the slider immediately regardless.
const TEMPO_SAVE_DELAY_MS = 400;
const TEMPO_STEP = 0.01;

const pct = t => `${Math.round(t * 100)}%`;

/** Tempo slider for the playing track. Resets to 100% for each new track. */
function TempoControl({ request, runtime }) {
  const saved = tempoOf(request);
  const [tempo, setTempo] = useState(saved);
  const saveTimer = useRef(null);

  // Follow changes made on another device (unless the DJ is mid-drag here).
  useEffect(() => {
    if (!saveTimer.current) setTempo(saved);
  }, [saved]);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  function change(next) {
    const t = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(next * 100) / 100));
    setTempo(t);
    runtime.playback.previewTempo(t);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      runtime.setTempo(request, t);
    }, TEMPO_SAVE_DELAY_MS);
  }

  return (
    <div className={s.row}>
      <span className={s.deckLabel}>Tempo</span>
      <button className={s.ghostBtn} onClick={() => change(tempo - TEMPO_STEP)} disabled={tempo <= TEMPO_MIN} aria-label="Slower">−</button>
      <input
        type="range"
        className={s.slider}
        min={TEMPO_MIN} max={TEMPO_MAX} step={TEMPO_STEP}
        value={tempo}
        onChange={e => change(Number(e.target.value))}
        aria-label="Tempo"
      />
      <button className={s.ghostBtn} onClick={() => change(tempo + TEMPO_STEP)} disabled={tempo >= TEMPO_MAX} aria-label="Faster">+</button>
      <button
        className={`${s.ghostBtn} ${s.tempoValue}`}
        onClick={() => change(1)}
        disabled={tempo === 1}
        title="Reset to 100%"
      >
        {pct(tempo)}
      </button>
    </div>
  );
}

function FadeButtons({ request, runtime }) {
  const { playback } = runtime;
  const disabled = !!request.pausedAt || playback.fadingOut;
  return (
    <div className={s.row}>
      <span className={s.deckLabel}>Fade</span>
      <button className={s.ghostBtn} onClick={() => playback.fadeToNext(MANUAL_FADE_SEC)} disabled={disabled}>
        Fade → Next
      </button>
      <button className={s.ghostBtn} onClick={() => playback.fadeOutAndPause(MANUAL_FADE_SEC)} disabled={disabled}>
        {playback.fadingOut ? 'Fading…' : 'Fade out'}
      </button>
    </div>
  );
}

const VOLUME_STEP_DB = 0.5;

function formatDb(db) {
  return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
}

/** Loudness for the playing track, applied live. */
function VolumeControl({ playback }) {
  const db = playback.adjust.volumeDb;
  const change = next => playback.setVolumeDb(Math.min(VOLUME_MAX_DB, Math.max(VOLUME_MIN_DB, next)));
  return (
    <div className={s.row}>
      <span className={s.deckLabel}>Volume</span>
      <button className={s.ghostBtn} onClick={() => change(db - 1)} disabled={db <= VOLUME_MIN_DB} aria-label="Quieter">−</button>
      <input
        type="range"
        className={s.slider}
        min={VOLUME_MIN_DB} max={VOLUME_MAX_DB} step={VOLUME_STEP_DB}
        value={db}
        onChange={e => change(Number(e.target.value))}
        aria-label="Volume"
      />
      <button className={s.ghostBtn} onClick={() => change(db + 1)} disabled={db >= VOLUME_MAX_DB} aria-label="Louder">+</button>
      <button className={`${s.ghostBtn} ${s.tempoValue}`} onClick={() => change(0)} disabled={db === 0} title="Reset to 0 dB">
        {formatDb(db)}
      </button>
    </div>
  );
}

/** Save volume, In/Out and tempo to this file, so they apply every time it plays. */
function SaveToTrack({ runtime }) {
  const { playback, trackSettingsDirty } = runtime;
  return (
    <div className={s.row}>
      <span className={s.deckLabel} />
      {trackSettingsDirty ? (
        <>
          <button className={s.acceptBtn} onClick={runtime.saveTrackSettings} title="Volume, In/Out and tempo will apply every time this file plays">
            Save to track
          </button>
          <button className={s.ghostBtn} onClick={playback.revertAdjustments}>Revert</button>
        </>
      ) : (
        <span className={s.muted}>{playback.saved ? '✓ Saved for this track' : 'Adjust volume, In/Out or tempo, then save to this track'}</span>
      )}
    </div>
  );
}

function CrossfadeChoice({ playback }) {
  return (
    <div className={s.row}>
      <span className={s.deckLabel}>Crossfade</span>
      <div className={s.chips}>
        {CROSSFADE_OPTIONS.map(sec => (
          <button
            key={sec}
            className={`${s.chip} ${playback.crossfadeSec === sec ? s.chipActive : ''}`}
            onClick={() => playback.setCrossfade(sec)}
          >
            {sec ? `${sec}s` : 'Off'}
          </button>
        ))}
      </div>
    </div>
  );
}

function OutputChoice({ outputs, playback }) {
  if (!outputs.supported) return null;
  return (
    <>
      <div className={s.row}>
        <span className={s.deckLabel}>Speakers</span>
        {outputs.needsAccess ? (
          <button
            className={s.ghostBtn}
            onClick={outputs.requestAccess}
            title="Your browser asks for microphone permission before it will list speakers. Nothing is recorded."
          >
            Choose speakers…
          </button>
        ) : (
          <select
            className={s.select}
            value={playback.outputDeviceId ?? ''}
            onChange={e => playback.setOutputDevice(e.target.value || null)}
          >
            <option value="">System default</option>
            {outputs.devices.filter(d => d.id !== 'default').map(d => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        )}
      </div>
      {outputs.error && <p className={s.error}>{outputs.error}</p>}
    </>
  );
}

/**
 * Mixing controls for the computer playing the music: tempo, volume, In/Out
 * points and fades for the current track (savable to its file), plus
 * crossfade length and output device.
 */
export default function DeckControls({ runtime, nowPlaying }) {
  const { playback, outputs } = runtime;
  // Tempo and fades need this computer to be playing the track's file.
  const playingHere = !!nowPlaying && playback.requestId === nowPlaying._id && !!playback.entry;

  return (
    <div className={s.deck}>
      {/* Keyed per track so an unsaved drag never lands on the next song. */}
      {playingHere && <TempoControl key={nowPlaying._id} request={nowPlaying} runtime={runtime} />}
      {playingHere && <VolumeControl playback={playback} />}
      {playingHere && <TrackTimeline runtime={runtime} request={nowPlaying} />}
      {playingHere && <SaveToTrack runtime={runtime} />}
      {playingHere && <FadeButtons request={nowPlaying} runtime={runtime} />}
      <CrossfadeChoice playback={playback} />
      <OutputChoice outputs={outputs} playback={playback} />
    </div>
  );
}
