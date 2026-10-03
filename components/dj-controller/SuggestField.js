import { useState } from 'react';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { diffColor } from './utils';
import { useCatalogSearch, describeTrack } from '../../lib/client/catalog/useCatalogSearch';

/**
 * An Add to Queue text field with suggestions: catalog dances matching this
 * field first, and — only when none match — songs from the music catalog
 * (which itself falls back to MusicBrainz).
 *
 * `danceMatches` is the parent's search of the dance catalog for this field's
 * text; pass [] for fields with no dance search (e.g. partner songs).
 */
export default function SuggestField({
  label, optional = false, value, onChange, placeholder,
  danceMatches = [], onPickDance, onPickSong, suggestionsEnabled = true,
}) {
  const [focused, setFocused] = useState(false);
  const open = focused && suggestionsEnabled;
  const songs = useCatalogSearch(value, { enabled: open && danceMatches.length === 0 });
  const showDances = open && danceMatches.length > 0;
  const showSongs = open && songs.isActive && (songs.results.length > 0 || !songs.isLoading);

  // Keep focus in the input while a suggestion is clicked.
  const keepFocus = e => e.preventDefault();

  return (
    <>
      <label className={styles.djAddLabel}>
        {label} {optional && <span className={styles.djAddOptional}>(optional)</span>}
      </label>
      <div className={styles.djAddFieldWrap}>
        <input
          className={styles.djAddSearch}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={100}
          autoComplete="off"
        />
        {showDances && (
          <div className={styles.djAddSuggestions}>
            {danceMatches.map(d => (
              <button key={d.id} className={styles.djAddSuggestion} onMouseDown={keepFocus} onClick={() => { setFocused(false); onPickDance(d); }}>
                <span className={styles.djAddSuggName}>{d.danceName}</span>
                <span className={styles.djAddSuggMeta}>
                  {[d.songName, d.artist].filter(Boolean).join(' — ')}
                  {d.difficulty && <span style={{ color: diffColor(d.difficulty) }}> · {d.difficulty}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
        {showSongs && (
          <div className={styles.djAddSuggestions}>
            <div className={styles.djAddSuggMeta} style={{ padding: '6px 10px' }}>
              {songs.results.length ? 'No catalog dance — songs:' : 'No matching dances or songs'}
            </div>
            {songs.results.map(t => (
              <button key={t.id} className={styles.djAddSuggestion} onMouseDown={keepFocus} onClick={() => { setFocused(false); onPickSong(t); }}>
                <span className={styles.djAddSuggName}>{t.title}</span>
                <span className={styles.djAddSuggMeta}>{describeTrack(t)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
