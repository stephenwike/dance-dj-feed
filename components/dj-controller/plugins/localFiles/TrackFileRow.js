import { useState } from 'react';
import s from './LocalFiles.module.css';
import LibrarySearch from './LibrarySearch';
import { requestTrack } from '../../../../lib/client/dj/plugins/localFiles/requestIdentity';
import { isGuess } from '../../../../lib/client/dj/plugins/localFiles/library';

// How the file was found, strongest first (see library.explainMatch).
const MATCH_LABELS = {
  assigned: 'chosen by you',
  linked: 'your file for this',
  isrc: 'exact recording',
  name: 'matched by name',
  history: 'suggested (played for this before) — not saved yet',
  suggested: 'suggested — not saved yet',
};

const fileName = key => key.split('/').pop();

/**
 * QUEUE_ITEM slot: which file a queued (or playing) request will play, with
 * ways to fix it — accept a suggestion, or open Find file (closest matches
 * plus search).
 */
export default function TrackFileRow({ runtime, request }) {
  const [picking, setPicking] = useState(false);
  if (runtime.library.status !== 'ready' || request.danceType === 'message') return null;

  const match = runtime.explainFor(request);
  const entry = match?.entry;
  const guess = isGuess(match);
  const assign = picked => { setPicking(false); runtime.assignFile(request, picked); };

  if (picking) {
    return (
      <div className={s.item}>
        <LibrarySearch
          search={runtime.search}
          initialQuery={requestTrack(request).title || request.danceName}
          placeholder="Find the file for this request…"
          closest={runtime.closestFor(request)}
          onClose={() => setPicking(false)}
          onPick={assign}
        />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className={`${s.item} ${s.row}`}>
        <span className={s.itemMissing}>✕ No file found — will be timed, not played</span>
        <button className={s.ghostBtn} onClick={() => setPicking(true)}>Find file</button>
      </div>
    );
  }

  return (
    <div className={`${s.item} ${s.row}`}>
      <span className={guess ? s.itemGuess : s.itemFile} title={entry.key}>
        ♪ {fileName(entry.key)} · {match.artistDiffers ? 'suggested (artist tag differs) — not saved yet' : MATCH_LABELS[match.via]}
      </span>
      {guess && (
        <button className={s.acceptBtn} onClick={() => assign(entry)} title="Remember this file for this from now on">
          ✓ Accept
        </button>
      )}
      <button className={s.ghostBtn} onClick={() => setPicking(true)}>Change</button>
    </div>
  );
}

/** Border tint for a request's card: red when no file, amber for a guess. */
export function itemTone(runtime, request) {
  if (runtime.library.status !== 'ready' || request.danceType === 'message') return null;
  const match = runtime.explainFor(request);
  if (!match) return 'danger';
  return isGuess(match) ? 'warning' : null;
}
