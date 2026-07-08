import { useState } from 'react';
import useSWR from 'swr';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { diffColor, PARTNER_STYLES } from './utils';

const fetcher = url => fetch(url).then(r => r.json());

export default function DJAddPanel({ activeSession, nextQueuePos, mutate }) {
  const [type, setType] = useState('line'); // 'line' | 'partner'

  // Line dance state
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  // Partner dance state
  const [partnerStyle, setPartnerStyle] = useState('');
  const [partnerSong, setPartnerSong] = useState('');
  const [partnerArtist, setPartnerArtist] = useState('');

  // Custom line dance fields (used when selected.custom is true)
  const [customSong, setCustomSong] = useState('');
  const [customArtist, setCustomArtist] = useState('');

  // Shared duration (minutes)
  const DEFAULT_DURATION_MIN = 3;
  const [durationMin, setDurationMin] = useState(DEFAULT_DURATION_MIN);

  const [adding, setAdding] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState(null);

  const { data: dances = [], isLoading } = useSWR('/api/dj/dances', fetcher, {
    revalidateOnFocus: false,
  });

  const filtered = query.trim()
    ? dances.filter(d => d.danceName.toLowerCase().includes(query.toLowerCase()))
    : dances;

  // Style suggestions for partner dance
  const styleSuggestions = partnerStyle.trim()
    ? PARTNER_STYLES.filter(s =>
        s.toLowerCase().includes(partnerStyle.toLowerCase()) &&
        s.toLowerCase() !== partnerStyle.toLowerCase()
      ).slice(0, 5)
    : [];

  function switchType(t) {
    setType(t);
    setSelected(null);
    setQuery('');
    setRecentlyAdded(null);
    setDurationMin(DEFAULT_DURATION_MIN);
    setCustomSong('');
    setCustomArtist('');
  }

  async function postRequest(body) {
    setAdding(true);
    try {
      const res = await fetch('/api/dj/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId:     String(activeSession._id),
          clientId:      'dj',
          requesterName: 'DJ',
          status:        'approved',
          queuePosition: nextQueuePos,
          ...body,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (e) {
      console.error('DJ add failed', e);
      return false;
    } finally {
      setAdding(false);
    }
  }

  async function handleAddLine() {
    if (!selected || !activeSession || adding) return;
    const ok = await postRequest({
      danceId:     selected.id ?? null,
      danceName:   selected.danceName,
      songName:    selected.custom ? customSong.trim() : (selected.songName   ?? ''),
      artist:      selected.custom ? customArtist.trim() : (selected.artist   ?? ''),
      difficulty:  selected.difficulty ?? '',
      stepsheet:   selected.stepsheet  ?? '',
      duration_ms: Math.max(1, durationMin) * 60_000,
      spotifyUri:  selected.spotifyUri  ?? null,
    });
    if (ok) {
      setRecentlyAdded(selected.danceName);
      setSelected(null);
      setCustomSong('');
      setCustomArtist('');
      setTimeout(() => setRecentlyAdded(null), 2500);
      mutate();
    }
  }

  async function handleAddPartner() {
    if (!activeSession || adding) return;
    const styleTrimmed = partnerStyle.trim();
    const ok = await postRequest({
      danceId:      null,
      danceName:    styleTrimmed ? `Partner — ${styleTrimmed}` : 'Partner Dance',
      danceType:    'partner',
      partnerStyle: styleTrimmed || null,
      songName:     partnerSong.trim(),
      artist:       partnerArtist.trim(),
      duration_ms:  Math.max(1, durationMin) * 60_000,
    });
    if (ok) {
      const label = styleTrimmed ? `Partner — ${styleTrimmed}` : 'Partner Dance';
      setRecentlyAdded(label);
      setPartnerStyle('');
      setPartnerSong('');
      setPartnerArtist('');
      setTimeout(() => setRecentlyAdded(null), 2500);
      mutate();
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Add to Queue</span>
      </div>

      <div className={styles.djAddBody}>
        {/* Tab switcher */}
        <div className={styles.djAddTabs}>
          <button
            className={`${styles.djAddTab} ${type === 'line' ? styles.djAddTabActive : ''}`}
            onClick={() => switchType('line')}
          >
            Line Dance
          </button>
          <button
            className={`${styles.djAddTab} ${type === 'partner' ? styles.djAddTabActive : ''}`}
            onClick={() => switchType('partner')}
          >
            Partner Dance
          </button>
        </div>

        {/* Success flash */}
        {recentlyAdded && (
          <div className={styles.djAddSuccess}>
            ✓ {recentlyAdded} added to queue
          </div>
        )}

        {/* ── Line Dance tab ── */}
        {type === 'line' && (
          <>
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

            {selected && !recentlyAdded && (
              <div className={`${styles.djAddConfirm} ${selected.custom ? styles.djAddConfirmCustom : ''}`}>
                <div className={styles.djAddConfirmName}>
                  {selected.danceName}
                  {selected.custom && <span className={styles.djAddCustomTag}>custom</span>}
                </div>
                {selected.custom && (
                  <>
                    <input
                      className={styles.djAddSearch}
                      placeholder="Song (optional)"
                      value={customSong}
                      onChange={e => setCustomSong(e.target.value)}
                      maxLength={100}
                      autoComplete="off"
                    />
                    <input
                      className={styles.djAddSearch}
                      placeholder="Artist (optional)"
                      value={customArtist}
                      onChange={e => setCustomArtist(e.target.value)}
                      maxLength={100}
                      autoComplete="off"
                    />
                  </>
                )}
                <div className={styles.djAddDurationWrap}>
                  <input
                    type="number"
                    className={styles.djAddDuration}
                    value={durationMin}
                    min={1}
                    max={60}
                    onChange={e => setDurationMin(Number(e.target.value) || DEFAULT_DURATION_MIN)}
                    title="Duration in minutes"
                  />
                  <span className={styles.djAddDurationLabel}>min</span>
                </div>
                <button
                  className={styles.djAddBtn}
                  onClick={handleAddLine}
                  disabled={adding || !activeSession}
                >
                  {adding ? 'Adding…' : '+ Add'}
                </button>
              </div>
            )}

            <div className={styles.djAddList}>
              {isLoading && <p className={styles.empty}>Loading dances…</p>}
              {!isLoading && filtered.length === 0 && (
                <>
                  <p className={styles.empty}>No dances match &ldquo;{query}&rdquo;</p>
                  {query.trim() && (
                    <button
                      className={styles.djAddCustomBtn}
                      onClick={() => {
                        setSelected({ id: null, danceName: query.trim(), custom: true });
                        setDurationMin(DEFAULT_DURATION_MIN);
                        setCustomSong('');
                        setCustomArtist('');
                      }}
                    >
                      + Add &ldquo;{query.trim()}&rdquo; as custom line dance
                    </button>
                  )}
                </>
              )}
              {filtered.map(dance => (
                <button
                  key={dance.id}
                  className={`${styles.djAddItem} ${selected?.id === dance.id ? styles.djAddItemActive : ''}`}
                  onClick={() => {
                const next = selected?.id === dance.id ? null : dance;
                setSelected(next);
                if (next?.duration_ms) setDurationMin(Math.round(next.duration_ms / 60000) || DEFAULT_DURATION_MIN);
                else setDurationMin(DEFAULT_DURATION_MIN);
              }}
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
          </>
        )}

        {/* ── Partner Dance tab ── */}
        {type === 'partner' && !recentlyAdded && (
          <div className={styles.djAddPartnerForm}>
            <p className={styles.djAddPartnerHint}>
              Specify a style and/or song, or leave blank to add a generic partner dance.
            </p>

            <label className={styles.djAddLabel}>Style <span className={styles.djAddOptional}>(optional)</span></label>
            <div className={styles.djAddFieldWrap}>
              <input
                className={styles.djAddSearch}
                placeholder="e.g. Two-Step, Waltz, Swing…"
                value={partnerStyle}
                onChange={e => setPartnerStyle(e.target.value)}
                maxLength={60}
                autoComplete="off"
              />
              {styleSuggestions.length > 0 && (
                <div className={styles.djAddSuggestions}>
                  {styleSuggestions.map(s => (
                    <button
                      key={s}
                      className={styles.djAddSuggestion}
                      onClick={() => setPartnerStyle(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className={styles.djAddLabel}>Song <span className={styles.djAddOptional}>(optional)</span></label>
            <input
              className={styles.djAddSearch}
              placeholder="Song name"
              value={partnerSong}
              onChange={e => setPartnerSong(e.target.value)}
              maxLength={100}
              autoComplete="off"
            />

            <label className={styles.djAddLabel}>Artist <span className={styles.djAddOptional}>(optional)</span></label>
            <input
              className={styles.djAddSearch}
              placeholder="Artist name"
              value={partnerArtist}
              onChange={e => setPartnerArtist(e.target.value)}
              maxLength={100}
              autoComplete="off"
            />

            <label className={styles.djAddLabel}>Duration</label>
            <div className={styles.djAddDurationRow}>
              <input
                type="number"
                className={styles.djAddSearch}
                value={durationMin}
                min={1}
                max={60}
                onChange={e => setDurationMin(Number(e.target.value) || DEFAULT_DURATION_MIN)}
              />
              <span className={styles.djAddDurationUnit}>minutes</span>
            </div>

            <button
              className={styles.djAddBtnFull}
              onClick={handleAddPartner}
              disabled={adding || !activeSession}
            >
              {adding ? 'Adding…' : '+ Add Partner Dance to Queue'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
