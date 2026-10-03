import s from './LocalFiles.module.css';
import DeckControls from './DeckControls';

/** Folder, permission and scan state for the music library. */
function LibraryState({ library }) {
  const { status, folderName, trackCount, scan, error, chooseFolder, reconnect, rescan } = library;

  if (status === 'loading') return <p className={s.hint}>Loading music library…</p>;

  if (status === 'unsupported') {
    return (
      <p className={s.hint}>
        This browser can&apos;t read local music. Music plays from the computer running this controller in Chrome or Edge.
      </p>
    );
  }

  if (status === 'no-folder') {
    return (
      <>
        <p className={s.hint}>Choose the folder your music is in. Files stay on this computer — nothing is uploaded.</p>
        <button className={s.primaryBtn} onClick={chooseFolder}>Choose music folder</button>
        {error && <p className={s.error}>{error}</p>}
      </>
    );
  }

  if (status === 'needs-permission') {
    return (
      <>
        <p className={s.hint}>Your browser needs permission to read <strong>{folderName}</strong> again.</p>
        <div className={s.row}>
          <button className={s.primaryBtn} onClick={reconnect}>Allow access</button>
          <button className={s.ghostBtn} onClick={chooseFolder}>Choose a different folder</button>
        </div>
        {error && <p className={s.error}>{error}</p>}
      </>
    );
  }

  return (
    <>
      <div className={s.row}>
        <span className={s.folder} title={folderName}>📁 {folderName}</span>
        <span className={s.muted}>{scan ? `Scanning ${scan.done}/${scan.total}` : `${trackCount} tracks`}</span>
        <button className={s.ghostBtn} onClick={rescan} disabled={!!scan}>Rescan</button>
        <button className={s.ghostBtn} onClick={chooseFolder} disabled={!!scan}>Change</button>
      </div>
      {scan && scan.total > 0 && (
        <div className={s.progress}>
          <div className={s.progressFill} style={{ width: `${(scan.done / scan.total) * 100}%` }} />
        </div>
      )}
      {error && <p className={s.error}>{error}</p>}
    </>
  );
}

/** Things the DJ must act on before music can play. */
function PlaybackNotices({ playback }) {
  return (
    <>
      {playback.blocked && (
        <div className={s.notice}>
          <span>The browser needs a click before it can play sound.</span>
          <button className={s.primaryBtn} onClick={playback.resume}>▶ Start audio</button>
        </div>
      )}
      {playback.busyElsewhere && (
        <div className={s.notice}>
          <span>This computer is playing another session&apos;s music. This session&apos;s queue is on hold.</span>
          <button className={s.primaryBtn} onClick={playback.takeOver}>Play this session instead</button>
        </div>
      )}
      {playback.error && <p className={s.error}>{playback.error}</p>}
    </>
  );
}

/**
 * QUEUE_HEADER slot: library status, playback prompts and mixing controls.
 * Each request's file is shown on its own card (TrackFileRow).
 */
export default function LocalFilesStatus({ runtime, controller }) {
  const { library, playback } = runtime;
  const ready = library.status === 'ready';

  return (
    <div className={s.panel}>
      <LibraryState library={library} />
      {ready && <PlaybackNotices playback={playback} />}
      {ready && <DeckControls runtime={runtime} nowPlaying={controller.playing[0]} />}
    </div>
  );
}
