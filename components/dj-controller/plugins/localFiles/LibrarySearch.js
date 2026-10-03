import { useState } from 'react';
import s from './LocalFiles.module.css';

function fmtDuration(ms) {
  if (!ms) return '';
  const secs = Math.round(ms / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function ResultButton({ entry, onPick, badge }) {
  return (
    <button type="button" className={s.result} onClick={() => onPick(entry)} title={entry.key}>
      <span className={s.resultInfo}>
        <span className={s.resultTitle}>{entry.title}</span>
        <span className={s.resultSub}>{[entry.artist, entry.album].filter(Boolean).join(' · ') || entry.key}</span>
      </span>
      {badge && <span className={s.resultScore}>{badge}</span>}
      <span className={s.resultDur}>{fmtDuration(entry.durationMs)}</span>
    </button>
  );
}

/**
 * Search box over the local library. Searching is in-memory, so results
 * update as the DJ types. Used both to add tracks and to assign a file.
 *
 * `closest` ([{ entry, score }]) lists the files most like what's being
 * assigned, with a match %, above the search results.
 */
export default function LibrarySearch({ search, onPick, onClose, placeholder = 'Search your music…', initialQuery = '', closest = [] }) {
  const [query, setQuery] = useState(initialQuery);
  const closestKeys = new Set(closest.map(c => c.entry.key));
  const results = search(query).filter(entry => !closestKeys.has(entry.key));

  return (
    <div className={s.search}>
      <div className={s.row}>
        <input
          className={s.searchInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
          placeholder={placeholder}
          autoFocus
        />
        <button type="button" className={s.ghostBtn} onClick={onClose} aria-label="Close search">✕</button>
      </div>
      {closest.length > 0 && (
        <>
          <span className={s.resultsHeading}>Closest matches</span>
          <ul className={s.results}>
            {closest.map(c => (
              <li key={c.entry.key}>
                <ResultButton entry={c.entry} onPick={onPick} badge={`${Math.round(c.score * 100)}%`} />
              </li>
            ))}
          </ul>
        </>
      )}
      {query.trim() && results.length === 0 && closest.length === 0 && <p className={s.hint}>No tracks match “{query}”.</p>}
      {results.length > 0 && (
        <>
          {closest.length > 0 && <span className={s.resultsHeading}>Search results</span>}
          <ul className={s.results}>
            {results.map(entry => (
              <li key={entry.key}>
                <ResultButton entry={entry} onPick={onPick} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
