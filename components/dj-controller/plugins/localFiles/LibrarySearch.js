import { useState } from 'react';
import s from './LocalFiles.module.css';

function fmtDuration(ms) {
  if (!ms) return '';
  const secs = Math.round(ms / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/**
 * Search box over the local library. Searching is in-memory, so results
 * update as the DJ types. Used both to add tracks and to assign a file.
 */
export default function LibrarySearch({ search, onPick, onClose, placeholder = 'Search your music…', initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery);
  const results = search(query);

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
      {query.trim() && results.length === 0 && <p className={s.hint}>No tracks match “{query}”.</p>}
      {results.length > 0 && (
        <ul className={s.results}>
          {results.map(entry => (
            <li key={entry.key}>
              <button type="button" className={s.result} onClick={() => onPick(entry)} title={entry.key}>
                <span className={s.resultInfo}>
                  <span className={s.resultTitle}>{entry.title}</span>
                  <span className={s.resultSub}>{[entry.artist, entry.album].filter(Boolean).join(' · ') || entry.key}</span>
                </span>
                <span className={s.resultDur}>{fmtDuration(entry.durationMs)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
