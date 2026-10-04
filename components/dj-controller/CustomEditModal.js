import { useState, useMemo, useEffect } from 'react';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { diffColor, DIFFICULTIES, PARTNER_STYLES } from './utils';
import SuggestField from './SuggestField';

export default function CustomEditModal({ group, onClose, onSave }) {
  const firstReq = group.requests[0];
  // null danceType means line dance (partner/message are always explicit)
  const initialType = firstReq?.danceType;
  const [editType, setEditType] = useState(
    initialType === 'partner' || initialType === 'message' ? initialType : 'line'
  );
  const [editStyle, setEditStyle] = useState(firstReq?.partnerStyle || '');
  const [partnerSong, setPartnerSong] = useState(firstReq?.songName || '');
  const [partnerArtist, setPartnerArtist] = useState(firstReq?.artist || '');
  const [editName, setEditName] = useState(group.danceName);
  const [editDifficulty, setEditDifficulty] = useState(group.difficulty || '');
  const [lineMode, setLineMode] = useState('search');
  const [danceSearch, setDanceSearch] = useState('');
  const [dbDances, setDbDances] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [selectedDb, setSelectedDb] = useState(null);
  const [saving, setSaving] = useState(false);

  // Song swap state — read from firstReq (group-level fields absent on queue-card edits)
  const [isSongSwap, setIsSongSwap] = useState(firstReq?.isSongSwap || false);
  const [swapSongName, setSwapSongName] = useState(firstReq?.swapSongName || '');
  const [swapArtist, setSwapArtist] = useState(firstReq?.swapArtist || '');
  // The music-catalog song picked for the swap / partner song, if any. Kept
  // from the request until the DJ edits the text; picking links the exact
  // recording (ISRC, length) for the local-files player.
  const [swapTrackId, setSwapTrackId] = useState(firstReq?.isSongSwap ? firstReq?.catalogTrackId ?? null : null);
  const [partnerTrackId, setPartnerTrackId] = useState(firstReq?.danceType === 'partner' ? firstReq?.catalogTrackId ?? null : null);

  useEffect(() => {
    setDbLoading(true);
    fetch('/api/dj/dances').then(r => r.json()).then(data => {
      setDbDances(data);
      setDbLoading(false);
    });
  }, []);

  // Auto-select DB dance when danceId is already set on the request
  useEffect(() => {
    if (!dbDances || !firstReq?.danceId) return;
    const match = dbDances.find(d => String(d.id) === String(firstReq.danceId));
    if (match) {
      setSelectedDb(match);
      setDanceSearch(match.danceName);
    }
  }, [dbDances]);

  const filteredDb = useMemo(() => {
    if (!dbDances || !danceSearch.trim()) return [];
    const q = danceSearch.toLowerCase();
    return dbDances.filter(d =>
      d.danceName?.toLowerCase().includes(q) || d.songName?.toLowerCase().includes(q)
    ).slice(0, 7);
  }, [dbDances, danceSearch]);

  function clearSwap() {
    setIsSongSwap(false);
    setSwapSongName('');
    setSwapArtist('');
    setSwapTrackId(null);
  }

  function pickSwapSong(t) {
    setSwapSongName(t.title);
    setSwapArtist(t.artist);
    setSwapTrackId(t.id);
  }

  function pickPartnerSong(t) {
    setPartnerSong(t.title);
    setPartnerArtist(t.artist);
    setPartnerTrackId(t.id);
  }

  async function handleSave() {
    setSaving(true);
    const updates = {};
    const isLineDance = selectedDb || editType === 'line';

    if (selectedDb) {
      Object.assign(updates, {
        danceId: selectedDb.id,
        danceName: selectedDb.danceName,
        songName: selectedDb.songName || '',
        artist: selectedDb.artist || '',
        difficulty: selectedDb.difficulty || '',
        stepsheet: selectedDb.stepsheet || '',
        duration_ms: selectedDb.duration_ms ?? null,
        danceType: null,
      });
    } else {
      updates.danceType = editType;
      if (editType === 'partner') {
        updates.partnerStyle = editStyle.trim();
        updates.songName = partnerSong.trim();
        updates.artist = partnerArtist.trim();
      }
      if (editType === 'line') {
        updates.danceName = editName.trim() || group.danceName;
        updates.difficulty = editDifficulty;
      }
    }

    // Include swap fields for line dances; clear them when switching to partner
    updates.isSongSwap = isLineDance && isSongSwap;
    updates.swapSongName = (isLineDance && isSongSwap) ? swapSongName.trim() || null : null;
    updates.swapArtist   = (isLineDance && isSongSwap) ? swapArtist.trim()   || null : null;

    // Link (or unlink) the catalog song the request plays. A line dance only
    // has one of its own when it's a swap; the dance's usual song comes from
    // the dance catalog.
    if (editType !== 'message' || selectedDb) {
      updates.catalogTrackId = isLineDance
        ? (isSongSwap ? swapTrackId : null)
        : (editType === 'partner' ? partnerTrackId : null);
    }

    await onSave(group.requests, updates);
    setSaving(false);
    onClose();
  }

  return (
    <div className={styles.modalOverlay} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>Edit Request</span>
          <button className={styles.btnClosePanel} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          <p className={styles.modalSubtitle}>
            &ldquo;{group.danceName}&rdquo; &mdash; {group.requests.length} requester{group.requests.length !== 1 ? 's' : ''}
          </p>

          <label className={styles.modalLabel}>Dance type</label>
          <div className={styles.customTypeToggle}>
            <button className={`${styles.customTypeBtn} ${editType === 'partner' ? styles.customTypeBtnActive : ''}`}
              onClick={() => { setEditType('partner'); clearSwap(); }}>👫 Partner Dance</button>
            <button className={`${styles.customTypeBtn} ${editType === 'line' ? styles.customTypeBtnActive : ''}`}
              onClick={() => setEditType('line')}>💃 Line Dance</button>
          </div>

          {editType === 'partner' && (
            <>
              <label className={styles.modalLabel}>Dance style</label>
              <input
                className={styles.customEditInput}
                list="partner-styles"
                value={editStyle}
                onChange={e => setEditStyle(e.target.value)}
                placeholder="e.g. Waltz, 2 Step, West Coast Swing…"
                autoFocus
              />
              <datalist id="partner-styles">
                {PARTNER_STYLES.map(s => <option key={s} value={s} />)}
              </datalist>
              <SuggestField
                label="Song name"
                value={partnerSong}
                onChange={v => { setPartnerSong(v); setPartnerTrackId(null); }}
                placeholder="e.g. Dust on the Bottle…"
                onPickSong={pickPartnerSong}
                labelClassName={styles.modalLabel}
                inputClassName={styles.customEditInput}
              />
              <SuggestField
                label="Artist"
                optional
                value={partnerArtist}
                onChange={v => { setPartnerArtist(v); setPartnerTrackId(null); }}
                placeholder="e.g. David Lee Murphy…"
                onPickSong={pickPartnerSong}
                labelClassName={styles.modalLabel}
                inputClassName={styles.customEditInput}
              />
            </>
          )}

          {editType === 'line' && (
            <>
              <label className={styles.modalLabel}>Identify as</label>
              <div className={styles.customTypeToggle}>
                <button className={`${styles.customTypeBtn} ${lineMode === 'search' ? styles.customTypeBtnActive : ''}`}
                  onClick={() => setLineMode('search')}>Search database</button>
                <button className={`${styles.customTypeBtn} ${lineMode === 'manual' ? styles.customTypeBtnActive : ''}`}
                  onClick={() => setLineMode('manual')}>Edit manually</button>
              </div>

              {lineMode === 'search' && (
                <div className={styles.customSearchWrap}>
                  {selectedDb ? (
                    <div className={styles.customSelectedDb}>
                      <span style={{ flex: 1 }}>{selectedDb.danceName}</span>
                      {selectedDb.difficulty && (
                        <span className={styles.diffPip} style={{ background: diffColor(selectedDb.difficulty), fontSize: '0.65rem' }}>
                          {selectedDb.difficulty}
                        </span>
                      )}
                      <button className={styles.customCancelBtn}
                        onClick={() => { setSelectedDb(null); setDanceSearch(''); }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <input className={styles.customEditInput} value={danceSearch}
                        onChange={e => setDanceSearch(e.target.value)}
                        placeholder={dbLoading ? 'Loading…' : 'Search by name or song…'}
                        autoFocus />
                      {filteredDb.length > 0 && (
                        <ul className={styles.customDbResults}>
                          {filteredDb.map(d => (
                            <li key={d.id}>
                              <button className={styles.customDbResult}
                                onClick={() => { setSelectedDb(d); setDanceSearch(d.danceName); }}>
                                <span>{d.danceName}</span>
                                {d.songName && <span className={styles.modalDanceSong}>{d.songName}</span>}
                                {d.difficulty && (
                                  <span className={styles.diffPip} style={{ background: diffColor(d.difficulty), fontSize: '0.6rem' }}>
                                    {d.difficulty}
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}

              {lineMode === 'manual' && (
                <>
                  <label className={styles.modalLabel}>Dance name</label>
                  <input className={styles.customEditInput} value={editName}
                    onChange={e => setEditName(e.target.value)} placeholder="Dance name" autoFocus />
                  <label className={styles.modalLabel}>Difficulty</label>
                  <select className={styles.customEditSelect} value={editDifficulty}
                    onChange={e => setEditDifficulty(e.target.value)}>
                    <option value="">Select difficulty…</option>
                    {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </>
              )}

              {/* ── Song swap ── */}
              {!isSongSwap ? (
                <button type="button" className={styles.swapToggleBtn} onClick={() => setIsSongSwap(true)}>
                  🎵 Song Swap
                </button>
              ) : (
                <div className={styles.swapSection}>
                  <div className={styles.swapSectionHead}>
                    <span className={styles.swapSectionTitle}>🎵 Song Swap</span>
                    <button type="button" className={styles.swapClearBtn} onClick={clearSwap} title="Remove song swap">✕</button>
                  </div>
                  <SuggestField
                    label="Song to play instead"
                    value={swapSongName}
                    onChange={v => { setSwapSongName(v); setSwapTrackId(null); }}
                    placeholder="Song name…"
                    onPickSong={pickSwapSong}
                    labelClassName={styles.modalLabel}
                    inputClassName={styles.customEditInput}
                    autoFocus
                  />
                  <SuggestField
                    label="Artist"
                    optional
                    value={swapArtist}
                    onChange={v => { setSwapArtist(v); setSwapTrackId(null); }}
                    placeholder="Artist name…"
                    onPickSong={pickSwapSong}
                    labelClassName={styles.modalLabel}
                    inputClassName={styles.customEditInput}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className={styles.modalFoot}>
          <button className={styles.customCancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={styles.customSaveBtn}
            onClick={handleSave}
            disabled={saving || (isSongSwap && !swapSongName.trim())}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
