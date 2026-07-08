import { useState, useMemo } from 'react';
import useSWR from 'swr';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { PARTNER_STYLES, diffColor } from './utils';

const fetcher = url => fetch(url).then(r => r.json());

export default function DJAddPanel({ activeSession, nextQueuePos, mutate }) {
  const [type, setType] = useState('line'); // 'line' | 'partner'

  // Line dance state
  const [lineName, setLineName] = useState('');
  const [lineSong, setLineSong] = useState('');
  const [lineArtist, setLineArtist] = useState('');
  const [catalogSelected, setCatalogSelected] = useState(null);

  // Partner dance state
  const [partnerStyle, setPartnerStyle] = useState('');
  const [partnerSong, setPartnerSong] = useState('');
  const [partnerArtist, setPartnerArtist] = useState('');

  // Shared duration (minutes)
  const DEFAULT_DURATION_MIN = 3;
  const [durationMin, setDurationMin] = useState(DEFAULT_DURATION_MIN);

  const [adding, setAdding] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState(null);

  // Catalog for line dance suggestions
  const { data: catalogDances = [] } = useSWR('/api/dj/dances', fetcher, { revalidateOnFocus: false });

  const lineSuggestions = useMemo(() => {
    if (!lineName.trim() || catalogSelected) return [];
    const q = lineName.toLowerCase();
    return catalogDances.filter(d => d.danceName.toLowerCase().includes(q)).slice(0, 8);
  }, [lineName, catalogSelected, catalogDances]);

  function selectCatalogDance(d) {
    setLineName(d.danceName);
    setLineSong(d.songName ?? '');
    setLineArtist(d.artist ?? '');
    if (d.duration_ms) setDurationMin(Math.round(d.duration_ms / 60000) || DEFAULT_DURATION_MIN);
    setCatalogSelected(d);
  }

  // Style suggestions for partner dance
  const styleSuggestions = partnerStyle.trim()
    ? PARTNER_STYLES.filter(s =>
        s.toLowerCase().includes(partnerStyle.toLowerCase()) &&
        s.toLowerCase() !== partnerStyle.toLowerCase()
      ).slice(0, 5)
    : [];

  function switchType(t) {
    setType(t);
    setRecentlyAdded(null);
    setDurationMin(DEFAULT_DURATION_MIN);
    setLineName('');
    setLineSong('');
    setLineArtist('');
    setCatalogSelected(null);
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
    if (!activeSession || adding || !lineName.trim()) return;
    const ok = await postRequest({
      danceId:     catalogSelected?.id ?? null,
      danceName:   lineName.trim(),
      songName:    lineSong.trim(),
      artist:      lineArtist.trim(),
      duration_ms: Math.max(1, durationMin) * 60_000,
      ...(catalogSelected?.difficulty && { difficulty: catalogSelected.difficulty }),
      ...(catalogSelected?.stepsheet && { stepsheet: catalogSelected.stepsheet }),
    });
    if (ok) {
      setRecentlyAdded(lineName.trim());
      setLineName('');
      setLineSong('');
      setLineArtist('');
      setCatalogSelected(null);
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
        {type === 'line' && !recentlyAdded && (
          <div className={styles.djAddPartnerForm}>
            <label className={styles.djAddLabel}>Dance Name</label>
            <div className={styles.djAddFieldWrap}>
              <input
                className={styles.djAddSearch}
                placeholder="Search catalog or type a name…"
                value={lineName}
                onChange={e => { setLineName(e.target.value); setCatalogSelected(null); }}
                maxLength={100}
                autoComplete="off"
              />
              {lineSuggestions.length > 0 && (
                <div className={styles.djAddSuggestions}>
                  {lineSuggestions.map(d => (
                    <button
                      key={d.id}
                      className={styles.djAddSuggestion}
                      onClick={() => selectCatalogDance(d)}
                    >
                      <span className={styles.djAddSuggName}>{d.danceName}</span>
                      {(d.songName || d.difficulty) && (
                        <span className={styles.djAddSuggMeta}>
                          {d.songName}
                          {d.difficulty && <span style={{ color: diffColor(d.difficulty) }}> · {d.difficulty}</span>}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {catalogSelected && (
              <div className={styles.djAddCatalogTag}>
                <span>From catalog</span>
                {catalogSelected.difficulty && (
                  <span style={{ color: diffColor(catalogSelected.difficulty) }}> · {catalogSelected.difficulty}</span>
                )}
                <button
                  className={styles.djAddCatalogClear}
                  onClick={() => { setCatalogSelected(null); setLineName(''); setLineSong(''); setLineArtist(''); setDurationMin(DEFAULT_DURATION_MIN); }}
                >
                  ✕ clear
                </button>
              </div>
            )}

            <label className={styles.djAddLabel}>Song <span className={styles.djAddOptional}>(optional)</span></label>
            <input
              className={styles.djAddSearch}
              placeholder="Song name"
              value={lineSong}
              onChange={e => setLineSong(e.target.value)}
              maxLength={100}
              autoComplete="off"
            />

            <label className={styles.djAddLabel}>Artist <span className={styles.djAddOptional}>(optional)</span></label>
            <input
              className={styles.djAddSearch}
              placeholder="Artist name"
              value={lineArtist}
              onChange={e => setLineArtist(e.target.value)}
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
              onClick={handleAddLine}
              disabled={adding || !activeSession || !lineName.trim()}
            >
              {adding ? 'Adding…' : '+ Add Line Dance to Queue'}
            </button>
          </div>
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
