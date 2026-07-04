import { useState } from 'react';
import useSWR from 'swr';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { diffColor } from './utils';

const fetcher = url => fetch(url).then(r => r.json());

export default function DJAddPanel({ activeSession, nextQueuePos, mutate }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState(null);

  const { data: dances = [], isLoading } = useSWR('/api/dj/dances', fetcher, {
    revalidateOnFocus: false,
  });

  const filtered = query.trim()
    ? dances.filter(d => d.danceName.toLowerCase().includes(query.toLowerCase()))
    : dances;

  async function handleAdd() {
    if (!selected || !activeSession || adding) return;
    setAdding(true);
    try {
      const res = await fetch('/api/dj/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId:     String(activeSession._id),
          danceId:       selected.id,
          danceName:     selected.danceName,
          songName:      selected.songName  ?? '',
          artist:        selected.artist    ?? '',
          difficulty:    selected.difficulty ?? '',
          stepsheet:     selected.stepsheet  ?? '',
          duration_ms:   selected.duration_ms ?? null,
          spotifyUri:    selected.spotifyUri  ?? null,
          clientId:      'dj',
          requesterName: 'DJ',
          status:        'approved',
          queuePosition: nextQueuePos,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setRecentlyAdded(selected.danceName);
      setSelected(null);
      setTimeout(() => setRecentlyAdded(null), 2500);
      mutate();
    } catch (e) {
      console.error('DJ add failed', e);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Add to Queue</span>
      </div>

      <div className={styles.djAddBody}>
        {/* Search */}
        <div className={styles.djAddSearchWrap}>
          <input
            className={styles.djAddSearch}
            placeholder="Search dances…"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(null); }}
            autoComplete="off"
          />
          {query && (
            <button className={styles.djAddClear} onClick={() => { setQuery(''); setSelected(null); }}>✕</button>
          )}
        </div>

        {/* Success flash */}
        {recentlyAdded && (
          <div className={styles.djAddSuccess}>
            ✓ {recentlyAdded} added to queue
          </div>
        )}

        {/* Selected confirm bar */}
        {selected && !recentlyAdded && (
          <div className={styles.djAddConfirm}>
            <div className={styles.djAddConfirmName}>{selected.danceName}</div>
            <button
              className={styles.djAddBtn}
              onClick={handleAdd}
              disabled={adding || !activeSession}
            >
              {adding ? 'Adding…' : '+ Add to Queue'}
            </button>
          </div>
        )}

        {/* Dance list */}
        <div className={styles.djAddList}>
          {isLoading && <p className={styles.empty}>Loading dances…</p>}
          {!isLoading && filtered.length === 0 && (
            <p className={styles.empty}>No dances match &ldquo;{query}&rdquo;</p>
          )}
          {filtered.map(dance => (
            <button
              key={dance.id}
              className={`${styles.djAddItem} ${selected?.id === dance.id ? styles.djAddItemActive : ''}`}
              onClick={() => setSelected(s => s?.id === dance.id ? null : dance)}
            >
              <div className={styles.djAddItemMain}>
                <span className={styles.djAddItemName}>{dance.danceName}</span>
                {dance.difficulty && (
                  <span className={styles.djAddDiff} style={{ color: diffColor(dance.difficulty) }}>
                    {dance.difficulty}
                  </span>
                )}
              </div>
              {(dance.songName || dance.artist) && (
                <div className={styles.djAddItemMeta}>
                  {dance.songName}{dance.artist ? ` — ${dance.artist}` : ''}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
