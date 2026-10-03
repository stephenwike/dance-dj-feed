import { useState, useMemo } from 'react';
import useSWR from 'swr';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { PARTNER_STYLES, diffColor } from './utils';
import { fetcher } from '../../lib/client/fetcher';
import { searchDances } from '../../lib/client/dj/danceSearch';
import SuggestField from './SuggestField';

export default function DJAddPanel({ activeSession, nextQueuePos, mutate }) {
  const [type, setType] = useState('line'); // 'line' | 'partner'

  // Line dance state
  const [lineName, setLineName] = useState('');
  const [lineSong, setLineSong] = useState('');
  const [lineArtist, setLineArtist] = useState('');
  const [catalogSelected, setCatalogSelected] = useState(null); // dance from the ldco catalog
  const [songTrack, setSongTrack] = useState(null);             // song from the music catalog

  // Partner dance state
  const [partnerStyle, setPartnerStyle] = useState('');
  const [partnerSong, setPartnerSong] = useState('');
  const [partnerArtist, setPartnerArtist] = useState('');
  const [partnerTrack, setPartnerTrack] = useState(null);       // song from the music catalog

  // Shared duration (minutes)
  const DEFAULT_DURATION_MIN = 3;
  const [durationMin, setDurationMin] = useState(DEFAULT_DURATION_MIN);

  const [adding, setAdding] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState(null);

  // Catalog for line dance suggestions
  const { data: catalogDances = [] } = useSWR('/api/dj/dances', fetcher, { revalidateOnFocus: false });

  // Each line-dance field searches the dance catalog by that field; once a
  // dance or song is picked, suggestions stop.
  const picked = !!(catalogSelected || songTrack);
  const nameMatches = useMemo(() => (picked ? [] : searchDances(catalogDances, 'danceName', lineName)), [picked, catalogDances, lineName]);
  const songMatches = useMemo(() => (picked ? [] : searchDances(catalogDances, 'songName', lineSong)), [picked, catalogDances, lineSong]);
  const artistMatches = useMemo(() => (picked ? [] : searchDances(catalogDances, 'artist', lineArtist)), [picked, catalogDances, lineArtist]);

  function durationFrom(ms) {
    if (ms) setDurationMin(Math.round(ms / 60000) || DEFAULT_DURATION_MIN);
  }

  function selectCatalogDance(d) {
    setLineName(d.danceName);
    setLineSong(d.songName ?? '');
    setLineArtist(d.artist ?? '');
    durationFrom(d.duration_ms);
    setCatalogSelected(d);
    setSongTrack(null);
  }

  // A music-catalog song, when no catalog dance matched. The song's title
  // doubles as the dance name unless one is already typed (picking from the
  // Dance Name field always uses it).
  function selectLineSong(t, { fromNameField = false } = {}) {
    setSongTrack(t);
    setLineSong(t.title);
    setLineArtist(t.artist);
    if (fromNameField || !lineName.trim()) setLineName(t.title);
    durationFrom(t.durationMs);
  }

  function selectPartnerSong(t) {
    setPartnerTrack(t);
    setPartnerSong(t.title);
    setPartnerArtist(t.artist);
    durationFrom(t.durationMs);
  }

  function clearLine() {
    setLineName('');
    setLineSong('');
    setLineArtist('');
    setCatalogSelected(null);
    setSongTrack(null);
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
    clearLine();
    setPartnerTrack(null);
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
      catalogTrackId: songTrack?.id ?? null,
      ...(catalogSelected?.difficulty && { difficulty: catalogSelected.difficulty }),
      ...(catalogSelected?.stepsheet && { stepsheet: catalogSelected.stepsheet }),
    });
    if (ok) {
      setRecentlyAdded(lineName.trim());
      clearLine();
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
      catalogTrackId: partnerTrack?.id ?? null,
    });
    if (ok) {
      const label = styleTrimmed ? `Partner — ${styleTrimmed}` : 'Partner Dance';
      setRecentlyAdded(label);
      setPartnerStyle('');
      setPartnerSong('');
      setPartnerArtist('');
      setPartnerTrack(null);
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
            <SuggestField
              label="Dance Name"
              placeholder="Search dances or songs, or type a name…"
              value={lineName}
              onChange={v => { setLineName(v); setCatalogSelected(null); }}
              danceMatches={nameMatches}
              suggestionsEnabled={!picked}
              onPickDance={selectCatalogDance}
              onPickSong={t => selectLineSong(t, { fromNameField: true })}
            />
            {(catalogSelected || songTrack) && (
              <div className={styles.djAddCatalogTag}>
                <span>{catalogSelected ? 'From dance catalog' : 'Song from music catalog'}</span>
                {catalogSelected?.difficulty && (
                  <span style={{ color: diffColor(catalogSelected.difficulty) }}> · {catalogSelected.difficulty}</span>
                )}
                <button
                  className={styles.djAddCatalogClear}
                  onClick={() => { clearLine(); setDurationMin(DEFAULT_DURATION_MIN); }}
                >
                  ✕ clear
                </button>
              </div>
            )}

            <SuggestField
              label="Song"
              optional
              placeholder="Song name"
              value={lineSong}
              onChange={v => { setLineSong(v); setSongTrack(null); }}
              danceMatches={songMatches}
              suggestionsEnabled={!picked}
              onPickDance={selectCatalogDance}
              onPickSong={t => selectLineSong(t)}
            />

            <SuggestField
              label="Artist"
              optional
              placeholder="Artist name"
              value={lineArtist}
              onChange={v => { setLineArtist(v); setSongTrack(null); }}
              danceMatches={artistMatches}
              suggestionsEnabled={!picked}
              onPickDance={selectCatalogDance}
              onPickSong={t => selectLineSong(t)}
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

            <SuggestField
              label="Song"
              optional
              placeholder="Search for a song…"
              value={partnerSong}
              onChange={v => { setPartnerSong(v); setPartnerTrack(null); }}
              suggestionsEnabled={!partnerTrack}
              onPickSong={selectPartnerSong}
            />

            <label className={styles.djAddLabel}>Artist <span className={styles.djAddOptional}>(optional)</span></label>
            <input
              className={styles.djAddSearch}
              placeholder="Artist name"
              value={partnerArtist}
              onChange={e => { setPartnerArtist(e.target.value); setPartnerTrack(null); }}
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
