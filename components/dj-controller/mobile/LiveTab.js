import r from './LiveTab.module.css';
import { Countdown, IconRestart, IconSkip, IconPause, IconPlay, IconRewind, IconFastFwd } from '../RemoteControl';
import { trackTitle, trackSub } from './trackText';

/**
 * Home tab on a phone — what the DJ needs on the dance floor: what's
 * playing, big transport buttons, the playback plugin's controls for the
 * playing track (e.g. tempo and volume — `pluginControls`), quick actions,
 * and what's next.
 *
 * Every button goes through the queue (ctl.handleAction), so the computer
 * playing the music follows, exactly as with the desktop controls.
 */
export default function LiveTab({ ctl, pluginControls, onOpenPage, onShowQueue }) {
  const { liveSession, playing, queue, handleAction: onAction } = ctl;
  const track = playing[0] ?? null;
  const isPaused = !!track?.pausedAt;
  const upNext = queue.slice(0, 3);

  if (!liveSession) {
    return (
      <div className={r.idle}>
        <p className={r.empty}>
          {ctl.workingSession?.status === 'draft'
            ? 'This session is a draft. Start it from the session menu at the top to go live.'
            : 'No session is live. Start one to take requests and play music.'}
        </p>
        <a className={r.start} href="/start">▶ Start an event</a>
      </div>
    );
  }

  return (
    <div className={r.live}>
      {!track ? (
        <div className={r.idle}>
          <p className={r.empty}>Nothing is playing.</p>
          {queue.length > 0 && (
            <button className={r.start} onClick={() => onAction(queue[0]._id, 'startQueue')}>▶ Start Queue</button>
          )}
        </div>
      ) : (
        <>
          <section className={r.now}>
            <span className={`${r.status} ${isPaused ? r.statusPaused : ''}`}>{isPaused ? 'Paused' : 'Now playing'}</span>
            <span className={r.trackName}>{trackTitle(track)}</span>
            {trackSub(track) && <span className={r.trackSub}>{trackSub(track)}</span>}
            <span className={r.countdown}>
              <Countdown playStartedAt={track.playStartedAt} duration_ms={track.duration_ms} paused={isPaused} pausedAt={track.pausedAt} />
            </span>
          </section>

          <section className={r.transport}>
            <button className={r.btn} onClick={() => onAction(track._id, 'restart')} aria-label="Restart"><IconRestart /></button>
            <button className={r.btn} onClick={() => onAction(track._id, 'shiftTime', 10_000)} aria-label="Back 10 seconds"><IconRewind /></button>
            <button
              className={`${r.btn} ${r.btnMain}`}
              onClick={() => onAction(track._id, isPaused ? 'resume' : 'pause')}
              aria-label={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <IconPlay /> : <IconPause />}
            </button>
            <button className={r.btn} onClick={() => onAction(track._id, 'shiftTime', -10_000)} aria-label="Forward 10 seconds"><IconFastFwd /></button>
            <button className={r.btn} onClick={() => onAction(track._id, 'advance')} aria-label="Skip to next"><IconSkip /></button>
          </section>

          {pluginControls && <section className={r.plugin}>{pluginControls}</section>}
        </>
      )}

      <section className={r.quick}>
        <button className={r.quickBtn} onClick={() => onOpenPage('announce')}>
          <span className={r.quickIcon}>📣</span>Announce
        </button>
        <button className={r.quickBtn} onClick={() => onOpenPage('add')}>
          <span className={r.quickIcon}>➕</span>Add to queue
        </button>
        <button
          className={`${r.quickBtn} ${ctl.requestsEnabled ? '' : r.quickOff}`}
          onClick={ctl.toggleRequestsEnabled}
          aria-pressed={!ctl.requestsEnabled}
        >
          <span className={r.quickIcon}>{ctl.requestsEnabled ? '📥' : '⛔'}</span>
          {ctl.requestsEnabled ? 'Requests on' : 'Requests paused'}
        </button>
      </section>

      {upNext.length > 0 && (
        <section className={r.next}>
          <span className={r.nextHeading}>Up next</span>
          {upNext.map((q, i) => (
            <div key={q._id} className={r.nextRow}>
              <span className={r.nextIndex}>{i + 1}</span>
              <span className={r.nextName}>{trackTitle(q)}</span>
            </div>
          ))}
          <button className={r.nextAll} onClick={onShowQueue}>See the whole queue ({queue.length}) ›</button>
        </section>
      )}
    </div>
  );
}
