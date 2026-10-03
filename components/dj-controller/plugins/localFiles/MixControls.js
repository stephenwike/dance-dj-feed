import MixSlider from './MixSlider';
import { TEMPO_MIN, TEMPO_MAX, tempoOf } from '../../../../lib/dj/tempo';
import { VOLUME_MIN_DB, VOLUME_MAX_DB, VOLUME_STEP_DB } from '../../../../lib/dj/volume';

const pct = t => `${Math.round(t * 100)}%`;
const formatDb = db => `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;

/**
 * Tempo and volume for the playing request. Both are stored on the request,
 * so they work from any device: the computer playing the music follows.
 *
 * `preview` — this device is playing the file: move the audio immediately
 * while the slider is dragged, ahead of the save.
 */
export default function MixControls({ runtime, request, preview = false, large = false }) {
  const { playback } = runtime;
  // The phone only knows what's on the request; the playing computer also
  // knows the file's saved level before anyone has touched the slider.
  const volumeDb = request.volumeDb ?? (preview ? playback.adjust.volumeDb : 0);
  return (
    <>
      <MixSlider
        key={`tempo-${request._id}`}
        label="Tempo"
        value={tempoOf(request)}
        min={TEMPO_MIN} max={TEMPO_MAX} step={0.01}
        format={pct}
        resetValue={1}
        resetTitle="Reset to 100%"
        onPreview={preview ? playback.previewTempo : undefined}
        onCommit={t => runtime.setTempo(request, t)}
        large={large}
      />
      <MixSlider
        key={`volume-${request._id}`}
        label="Volume"
        value={volumeDb}
        min={VOLUME_MIN_DB} max={VOLUME_MAX_DB} step={VOLUME_STEP_DB} nudge={1}
        format={formatDb}
        resetValue={0}
        resetTitle="Reset to 0 dB (as recorded)"
        onPreview={preview ? playback.setVolumeDb : undefined}
        onCommit={db => runtime.setVolume(request, db)}
        large={large}
      />
    </>
  );
}
