import { useState } from 'react';
import styles from '../../pages/dj-request/dj-request.module.css';
import { useCatalogSearch, describeTrack } from '../../lib/client/catalog/useCatalogSearch';

/**
 * Song field backed by the music catalog (/api/catalog/search).
 *
 * Picking a suggestion sets `track` (sent as catalogTrackId, so the DJ gets
 * the exact recording). Typing without picking still works: `text` is sent
 * as a free-text song name, and the artist box stays available for it.
 */
export default function CatalogSongPicker({
  text, onTextChange, track, onTrackChange, artist, onArtistChange,
  placeholder = 'Search for a song…', autoFocus = false,
}) {
  const [focused, setFocused] = useState(autoFocus);
  const { results, isLoading, isActive } = useCatalogSearch(text, { enabled: !track });

  function pick(t) {
    onTrackChange(t);
    onTextChange(t.title);
    onArtistChange(t.artist);
  }

  function clear() {
    onTrackChange(null);
    onTextChange('');
    onArtistChange('');
  }

  if (track) {
    return (
      <div className={styles.selectedDance}>
        <div className={styles.selectedInfo}>
          <span className={styles.selectedName}>{track.title}</span>
          <span className={styles.selectedSong}>{describeTrack(track)}</span>
        </div>
        <button type="button" className={styles.clearBtn} onClick={clear} aria-label="Clear song">✕</button>
      </div>
    );
  }

  const showSuggestions = focused && isActive && (results.length > 0 || !isLoading);
  return (
    <>
      <div className={styles.field}>
        <input
          className={styles.input}
          type="text"
          placeholder={placeholder}
          value={text}
          onChange={e => onTextChange(e.target.value)}
          onFocus={() => setFocused(true)}
          // Delay so a tap on a suggestion lands before the list closes.
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          maxLength={100}
          autoComplete="off"
          autoFocus={autoFocus}
        />
        {showSuggestions && (
          <CatalogSuggestionList
            results={results}
            onPick={pick}
            emptyText="No matches — your song will be sent as typed"
          />
        )}
      </div>
      <input
        className={styles.input}
        type="text"
        placeholder="Artist (optional)"
        value={artist}
        onChange={e => onArtistChange(e.target.value)}
        maxLength={100}
      />
    </>
  );
}

/** Dropdown of catalog songs in the request page's suggestion style. */
export function CatalogSuggestionList({ results, onPick, emptyText, heading }) {
  return (
    <ul className={styles.suggestions}>
      {heading && <li className={styles.noResults}>{heading}</li>}
      {results.length === 0 ? (
        <li className={styles.noResults}>{emptyText}</li>
      ) : results.map(t => (
        <li key={t.id}>
          <button type="button" className={styles.suggestion} onMouseDown={e => e.preventDefault()} onClick={() => onPick(t)}>
            <span className={styles.suggName}>{t.title}</span>
            <span className={styles.suggMeta}>{describeTrack(t)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
