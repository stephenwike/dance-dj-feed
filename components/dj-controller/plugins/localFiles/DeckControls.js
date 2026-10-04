import s from './LocalFiles.module.css';
import { CROSSFADE_OPTIONS, MANUAL_FADE_SEC } from '../../../../lib/client/dj/plugins/localFiles/mixing';
import TrackTimeline from './TrackTimeline';
import MixControls from './MixControls';

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
          <button className={s.ghostBtn} onClick={runtime.revertTrackSettings}>Revert</button>
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
      {!playback.outputDeviceId && (
        <p className={s.notice}>
          Playing through the system default output, so other tabs and apps can play through the
          venue speakers too. Pick the venue&apos;s output here, and set your computer&apos;s default
          output to something else (e.g. its own speakers, muted).
        </p>
      )}
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
  // These need this computer to be playing the track's file. (Tempo and
  // volume also work from other devices: see MixControls / RemoteMix.)
  const playingHere = !!nowPlaying && playback.requestId === nowPlaying._id && !!playback.entry;

  return (
    <div className={s.deck}>
      {playingHere && <MixControls runtime={runtime} request={nowPlaying} preview />}
      {playingHere && <TrackTimeline runtime={runtime} request={nowPlaying} />}
      {playingHere && <SaveToTrack runtime={runtime} />}
      {playingHere && <FadeButtons request={nowPlaying} runtime={runtime} />}
      <CrossfadeChoice playback={playback} />
      <OutputChoice outputs={outputs} playback={playback} />
    </div>
  );
}
