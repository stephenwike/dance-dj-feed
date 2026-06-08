import { useState, useMemo } from 'react';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { diffColor, timeAgo, DIFFICULTIES } from './utils';

export default function PendingCard({ request, onAction, resolvedName, repeatRequester }) {
  const { _id, danceName, songName, artist, difficulty, stepsheet, clientId, notes, createdAt, danceType } = request;
  const isCustom = !request.danceId;
  const displayName = resolvedName || clientId || '';
  const hasCustomName = displayName && displayName !== clientId;

  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState(danceType || 'partner');
  const [editName, setEditName] = useState(danceName);
  const [editDifficulty, setEditDifficulty] = useState(difficulty || '');
  const [lineMode, setLineMode] = useState('search');
  const [danceSearch, setDanceSearch] = useState('');
  const [dbDances, setDbDances] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [selectedDb, setSelectedDb] = useState(null);

  function openEdit() {
    setEditing(true);
    if (!dbDances) loadDances();
  }

  async function loadDances() {
    setDbLoading(true);
    const data = await fetch('/api/dj/dances').then(r => r.json());
    setDbDances(data);
    setDbLoading(false);
  }

  const filteredDb = useMemo(() => {
    if (!dbDances || !danceSearch.trim()) return [];
    const q = danceSearch.toLowerCase();
    return dbDances.filter(d =>
      d.danceName?.toLowerCase().includes(q) || d.songName?.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [dbDances, danceSearch]);

  async function saveEdit() {
    const updates = { danceType: editType };
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
      updates.danceName = editName.trim() || danceName;
      if (editType === 'line') updates.difficulty = editDifficulty;
    }
    await fetch(`/api/dj/requests/${_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setEditing(false);
    onAction(_id, 'mutate');
  }

  function cancelEdit() {
    setEditName(danceName); setEditType(danceType || 'partner');
    setEditDifficulty(difficulty || ''); setDanceSearch('');
    setSelectedDb(null); setEditing(false);
  }

  return (
    <div className={`${styles.pCard} ${repeatRequester ? styles.pCardRepeat : ''}`}>
      <div className={styles.pInfo}>
        <div className={styles.pName}>
          {stepsheet
            ? <a href={stepsheet} target="_blank" rel="noopener noreferrer" className={styles.pNameLink}>{danceName}</a>
            : danceName}
          {repeatRequester && <span className={styles.repeatTag}>repeat</span>}
          {isCustom && !editing && (
            <span className={styles.customTypeBadge} data-type={editType}>
              {editType === 'line' ? 'Line Dance' : 'Partner Dance'}
            </span>
          )}
        </div>
        {songName && <div className={styles.pSong}>{songName}{artist ? ` — ${artist}` : ''}</div>}
        <div className={styles.pMeta}>
          {difficulty && (
            <span className={styles.diffPip} style={{ background: diffColor(difficulty) }}>{difficulty}</span>
          )}
          {displayName && (
            <span className={styles.pWho}>
              {hasCustomName ? displayName : clientId}
              {hasCustomName && clientId && <span className={styles.qClientId}>{clientId}</span>}
            </span>
          )}
          <span className={styles.qAge}>{timeAgo(createdAt)}</span>
        </div>
        {notes && <div className={styles.qNote}>&ldquo;{notes}&rdquo;</div>}

        {isCustom && editing && (
          <div className={styles.customEdit}>
            <div className={styles.customTypeToggle}>
              <button className={`${styles.customTypeBtn} ${editType === 'partner' ? styles.customTypeBtnActive : ''}`}
                onClick={() => setEditType('partner')}>👫 Partner Dance</button>
              <button className={`${styles.customTypeBtn} ${editType === 'line' ? styles.customTypeBtnActive : ''}`}
                onClick={() => setEditType('line')}>💃 Line Dance</button>
            </div>

            {editType === 'partner' && (
              <input className={styles.customEditInput} value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Dance / song description (optional)"
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                autoFocus />
            )}

            {editType === 'line' && (
              <>
                <div className={styles.customTypeToggle} style={{ marginTop: 0 }}>
                  <button className={`${styles.customTypeBtn} ${lineMode === 'search' ? styles.customTypeBtnActive : ''}`}
                    onClick={() => setLineMode('search')}>Search database</button>
                  <button className={`${styles.customTypeBtn} ${lineMode === 'manual' ? styles.customTypeBtnActive : ''}`}
                    onClick={() => setLineMode('manual')}>Edit manually</button>
                </div>

                {lineMode === 'search' && (
                  <div className={styles.customSearchWrap}>
                    <input className={styles.customEditInput} value={danceSearch}
                      onChange={e => setDanceSearch(e.target.value)}
                      placeholder={dbLoading ? 'Loading dances…' : 'Search by name or song…'}
                      autoFocus />
                    {selectedDb ? (
                      <div className={styles.customSelectedDb}>
                        <span>{selectedDb.danceName}</span>
                        {selectedDb.difficulty && <span className={styles.diffPip} style={{ background: diffColor(selectedDb.difficulty) }}>{selectedDb.difficulty}</span>}
                        <button className={styles.customCancelBtn} onClick={() => { setSelectedDb(null); setDanceSearch(''); }}>✕</button>
                      </div>
                    ) : filteredDb.length > 0 && (
                      <ul className={styles.customDbResults}>
                        {filteredDb.map(d => (
                          <li key={d.id}>
                            <button className={styles.customDbResult} onClick={() => { setSelectedDb(d); setDanceSearch(d.danceName); }}>
                              <span>{d.danceName}</span>
                              {d.difficulty && <span className={styles.diffPip} style={{ background: diffColor(d.difficulty), fontSize: '0.6rem' }}>{d.difficulty}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {lineMode === 'manual' && (
                  <>
                    <input className={styles.customEditInput} value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Dance name" autoFocus />
                    <select className={styles.customEditSelect} value={editDifficulty}
                      onChange={e => setEditDifficulty(e.target.value)}>
                      <option value="">Select difficulty…</option>
                      {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </>
                )}
              </>
            )}

            <div className={styles.customEditActions}>
              <button className={styles.customSaveBtn} onClick={saveEdit}>Save</button>
              <button className={styles.customCancelBtn} onClick={cancelEdit}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      <div className={styles.pActions}>
        {isCustom && !editing && (
          <button className={styles.btnEdit} onClick={openEdit} title="Edit">✎</button>
        )}
        <button className={styles.btnApprove} onClick={() => onAction(_id, 'approve')}>Queue →</button>
        <button className={styles.btnSkip} onClick={() => onAction(_id, 'skip')}>Skip</button>
      </div>
    </div>
  );
}
