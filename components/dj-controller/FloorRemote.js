import r from './FloorRemote.module.css';
import { Countdown, IconRestart, IconSkip, IconPause, IconPlay, IconRewind, IconFastFwd } from './RemoteControl';

function trackTitle(t) {
  if (t.danceType === 'partner') return t.songName || t.partnerStyle || 'Partner Dance';
  return t.danceName;
}

function trackSub(t) {
  if (t.isSongSwap && t.swapSongName) return `↻ ${t.swapSongName}${t.swapArtist ? ` — ${t.swapArtist}` : ''}`;
  if (t.danceType === 'partner') return [t.partnerStyle, t.songName && t.artist].filter(Boolean).join(' · ');
  return t.songName ? `${t.songName}${t.artist ? ` — ${t.artist}` : ''}` : '';
}

/**
 * The controller for a phone on the dance floor: a full-screen panel with
 * what's playing, big transport buttons, the playback plugin's controls for
 * the playing track (e.g. tempo and volume — `children`), and what's next.
 *
 * Every button goes through the queue (onAction), so the computer playing the
 * music follows, exactly as with the desktop controls.
 */
export default function FloorRemote({ session, playing, queue, onAction, onClose, children }) {
  const track = playing[0] ?? null;
  const isPaused = !!track?.pausedAt;
  const upNext = queue.slice(0, 3);

  return (
    <div className={r.overlay} role="dialog" aria-modal="true" aria-label="Floor remote">
      <header className={r.header}>
        <div className={r.headerText}>
          <span className={r.title}>Floor Remote</span>
          {session && <span className={r.session}>{session.name}</span>}
        </div>
        <button className={r.close} onClick={onClose} aria-label="Close the floor remote (show the full controller)">✕</button>
      </header>

      {!session ? (
        <p className={r.empty}>Start a session to use the remote.</p>
      ) : !track ? (
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

          {children && <section className={r.plugin}>{children}</section>}
        </>
      )}

      {session && upNext.length > 0 && (
        <section className={r.next}>
          <span className={r.nextHeading}>Up next</span>
          {upNext.map((q, i) => (
            <div key={q._id} className={r.nextRow}>
              <span className={r.nextIndex}>{i + 1}</span>
              <span className={r.nextName}>{trackTitle(q)}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
