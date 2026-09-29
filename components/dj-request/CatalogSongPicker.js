import { useState, useEffect } from 'react';
import useSWR from 'swr';
import styles from '../../pages/dj-request/dj-request.module.css';
import { fetcher } from '../../lib/client/fetcher';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

function fmtDuration(ms) {
  if (!ms) return '';
  const secs = Math.round(ms / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Song field backed by the music catalog (/api/catalog/search).
 *
 * Picking a suggestion sets `track` (sent as catalogTrackId, so the DJ gets
 * the exact recording). Typing without picking still works: `text` is sent
 * as a free-text song name, and the artist box stays available for it.
 */
export default function CatalogSongPicker({ text, onTextChange, track, onTrackChange, artist, onArtistChange }) {
  const [focused, setFocused] = useState(false);
  const query = useDebounced(text.trim(), DEBOUNCE_MS);
  const searchUrl = !track && query.length >= MIN_QUERY_LENGTH
    ? `/api/catalog/search?q=${encodeURIComponent(query)}&limit=8`
    : null;
  const { data, isLoading } = useSWR(searchUrl, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const results = data?.results ?? [];

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
          <span className={styles.selectedSong}>
            {[track.artist, track.disambiguation, fmtDuration(track.durationMs)].filter(Boolean).join(' · ')}
          </span>
        </div>
        <button type="button" className={styles.clearBtn} onClick={clear} aria-label="Clear song">✕</button>
      </div>
    );
  }

  const showSuggestions = focused && searchUrl && (results.length > 0 || !isLoading);
  return (
    <>
      <div className={styles.field}>
        <input
          className={styles.input}
          type="text"
          placeholder="Search for a song…"
          value={text}
          onChange={e => onTextChange(e.target.value)}
          onFocus={() => setFocused(true)}
          // Delay so a tap on a suggestion lands before the list closes.
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          maxLength={100}
          autoComplete="off"
        />
        {showSuggestions && (
          <ul className={styles.suggestions}>
            {results.length === 0 ? (
              <li className={styles.noResults}>No matches — your song will be sent as typed</li>
            ) : results.map(t => (
              <li key={t.id}>
                <button type="button" className={styles.suggestion} onMouseDown={e => e.preventDefault()} onClick={() => pick(t)}>
                  <span className={styles.suggName}>{t.title}</span>
                  <span className={styles.suggMeta}>
                    {[t.artist, t.disambiguation, t.year, fmtDuration(t.durationMs)].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
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
