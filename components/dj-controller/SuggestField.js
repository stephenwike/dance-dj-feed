import { useState } from 'react';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { diffColor } from './utils';
import { useCatalogSearch, describeTrack } from '../../lib/client/catalog/useCatalogSearch';

// Shown when a dance matched on a different field than the one being typed in.
const MATCHED_ON_LABEL = { danceName: 'dance name match', songName: 'song match', artist: 'artist match' };

/**
 * An Add to Queue text field with suggestions: catalog dances first, and —
 * only when none match — songs from the music catalog (which itself falls
 * back to MusicBrainz).
 *
 * `danceMatches` is the parent's search of the dance catalog for this field's
 * text ([{ dance, matchedOn }], see searchDancesAnyField); `field` is which
 * dance field this box is for. Pass [] for boxes with no dance search
 * (e.g. partner songs).
 */
export default function SuggestField({
  label, optional = false, value, onChange, placeholder, field,
  danceMatches = [], onPickDance, onPickSong, suggestionsEnabled = true,
  labelClassName = styles.djAddLabel, inputClassName = styles.djAddSearch, autoFocus = false, inputRef,
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
      <label className={labelClassName}>
        {label} {optional && <span className={styles.djAddOptional}>(optional)</span>}
      </label>
      <div className={styles.djAddFieldWrap}>
        <input
          ref={inputRef}
          className={inputClassName}
          placeholder={placeholder}
          autoFocus={autoFocus}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={100}
          autoComplete="off"
        />
        {showDances && (
          <div className={styles.djAddSuggestions}>
            {danceMatches.map(({ dance: d, matchedOn }) => (
              <button key={d.id} className={styles.djAddSuggestion} onMouseDown={keepFocus} onClick={() => { setFocused(false); onPickDance(d); }}>
                <span className={styles.djAddSuggName}>{d.danceName}</span>
                <span className={styles.djAddSuggMeta}>
                  {[d.songName, d.artist].filter(Boolean).join(' — ')}
                  {d.difficulty && <span style={{ color: diffColor(d.difficulty) }}> · {d.difficulty}</span>}
                  {matchedOn !== field && <span> · {MATCHED_ON_LABEL[matchedOn]}</span>}
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
