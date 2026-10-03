import s from './LocalFiles.module.css';
import MixControls from './MixControls';

/**
 * REMOTE_CONTROLS slot: tempo and volume for the playing track, from any
 * device (e.g. the DJ's phone on the dance floor). They're saved on the
 * request; the computer playing the music applies them within a second.
 */
export default function RemoteMix({ runtime, controller }) {
  const playing = controller.playing[0];
  if (!playing || playing.danceType === 'message') return null;
  // This device may also be the one playing (e.g. a tablet): preview locally then.
  const playingHere = runtime.playback.requestId === playing._id && !!runtime.playback.entry;
  return (
    <div className={s.deck}>
      <MixControls runtime={runtime} request={playing} preview={playingHere} large />
    </div>
  );
}
