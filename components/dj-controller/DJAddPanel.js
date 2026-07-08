import { useState } from 'react';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { PARTNER_STYLES } from './utils';

export default function DJAddPanel({ activeSession, nextQueuePos, mutate }) {
  const [type, setType] = useState('line'); // 'line' | 'partner'

  // Line dance state
  const [lineName, setLineName] = useState('');
  const [lineSong, setLineSong] = useState('');
  const [lineArtist, setLineArtist] = useState('');

  // Partner dance state
  const [partnerStyle, setPartnerStyle] = useState('');
  const [partnerSong, setPartnerSong] = useState('');
  const [partnerArtist, setPartnerArtist] = useState('');

  // Shared duration (minutes)
  const DEFAULT_DURATION_MIN = 3;
  const [durationMin, setDurationMin] = useState(DEFAULT_DURATION_MIN);

  const [adding, setAdding] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState(null);

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
      danceId:  null,
      danceName: lineName.trim(),
      songName:  lineSong.trim(),
      artist:    lineArtist.trim(),
      duration_ms: Math.max(1, durationMin) * 60_000,
    });
    if (ok) {
      setRecentlyAdded(lineName.trim());
      setLineName('');
      setLineSong('');
      setLineArtist('');
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
            <input
              className={styles.djAddSearch}
              placeholder="e.g. Electric Slide, Waterfall…"
              value={lineName}
              onChange={e => setLineName(e.target.value)}
              maxLength={100}
              autoComplete="off"
            />

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
