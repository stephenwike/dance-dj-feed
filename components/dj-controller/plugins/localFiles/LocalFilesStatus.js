import { useState } from 'react';
import s from './LocalFiles.module.css';
import LibrarySearch from './LibrarySearch';
import DeckControls from './DeckControls';
import { requestTrack } from '../../../../lib/client/dj/plugins/localFiles/library';

// How the file was found, strongest first (see library.explainMatch).
const MATCH_LABELS = {
  assigned: 'chosen by you',
  linked: 'your usual file for this song',
  isrc: 'exact recording (ISRC)',
  name: 'matched by name',
};

function displayName(r) {
  const { title, artist } = requestTrack(r);
  return [title || r.danceName, artist].filter(Boolean).join(' — ');
}

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
 * Which file will play for a request, with a way to pick one when matching
 * found none. Shown for the current and next track so gaps surface early.
 */
function TrackCheck({ label, request, runtime }) {
  const [picking, setPicking] = useState(false);
  const match = runtime.explainFor(request);
  const entry = match?.entry;

  return (
    <div className={s.check}>
      <div className={s.row}>
        <span className={s.checkLabel}>{label}</span>
        <span className={s.checkName}>{displayName(request)}</span>
        {!picking && (
          <button className={s.ghostBtn} onClick={() => setPicking(true)}>{entry ? 'Change file' : 'Find file'}</button>
        )}
      </div>
      {entry
        ? <span className={s.fileOk} title={entry.key}>♪ {entry.key} · {MATCH_LABELS[match.via]}</span>
        : <span className={s.fileMissing}>No matching file — it will be timed, not played</span>}
      {picking && (
        <LibrarySearch
          search={runtime.search}
          initialQuery={requestTrack(request).title}
          placeholder="Find the file for this track…"
          onClose={() => setPicking(false)}
          onPick={async picked => { setPicking(false); await runtime.assignFile(request, picked); }}
        />
      )}
    </div>
  );
}

/** QUEUE_HEADER slot: library status, playback prompts, now/next file checks and mixing controls. */
export default function LocalFilesStatus({ runtime, controller }) {
  const { library, playback } = runtime;
  const nowPlaying = controller.playing[0];
  const upNext = controller.queue[0];
  const ready = library.status === 'ready';

  return (
    <div className={s.panel}>
      <LibraryState library={library} />
      {ready && <PlaybackNotices playback={playback} />}
      {ready && nowPlaying && <TrackCheck key={nowPlaying._id} label="Now" request={nowPlaying} runtime={runtime} />}
      {ready && upNext && <TrackCheck key={upNext._id} label="Next" request={upNext} runtime={runtime} />}
      {ready && <DeckControls runtime={runtime} nowPlaying={nowPlaying} />}
    </div>
  );
}
