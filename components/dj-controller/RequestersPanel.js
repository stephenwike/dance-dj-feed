import { useState, useRef } from 'react';
import useSWR from 'swr';
import styles from '../../pages/dj-controller/dj-controller.module.css';

const fetcher = url => fetch(url).then(r => r.json());

const DM_DURATIONS = [
  { label: '3m',  seconds: 180 },
  { label: '5m',  seconds: 300 },
  { label: '10m', seconds: 600 },
  { label: 'Until cleared', seconds: null },
];

function RequesterCard({
  r, walletBalance,
  expandedDm, expandedGift,
  dmText, setDmText, dmDuration, setDmDuration, dmSending,
  giftBeats, setGiftBeats, giftMessage, setGiftMessage, giftSending, giftError,
  onToggleDm, onToggleGift, onToggleSuppress, onSendDm, onSendGift, onSaveNickname,
}) {
  const isDmOpen = expandedDm === r.clientId;
  const isGiftOpen = expandedGift === r.clientId;
  const giftCost = (parseInt(giftBeats, 10) || 0) * 5;

  const [editingNick, setEditingNick] = useState(false);
  const [nickDraft, setNickDraft] = useState('');
  const nickInputRef = useRef(null);

  function openNickEdit() {
    setNickDraft(r.nickname ?? '');
    setEditingNick(true);
    setTimeout(() => nickInputRef.current?.focus(), 0);
  }

  function cancelNickEdit() {
    setEditingNick(false);
    setNickDraft('');
  }

  async function saveNick() {
    await onSaveNickname(r.clientId, nickDraft);
    setEditingNick(false);
    setNickDraft('');
  }

  return (
    <div className={`${styles.requesterCard} ${r.suppressed ? styles.requesterCardSuppressed : ''}`}>
      <div className={styles.requesterRow}>
        <div className={styles.requesterInfo}>
          {editingNick ? (
            <>
              <input
                ref={nickInputRef}
                className={styles.requesterNickInput}
                value={nickDraft}
                onChange={e => setNickDraft(e.target.value)}
                placeholder={r.displayName}
                maxLength={40}
                onKeyDown={e => { if (e.key === 'Enter') saveNick(); if (e.key === 'Escape') cancelNickEdit(); }}
              />
              <div className={styles.requesterNickActions}>
                <button className={styles.requesterNickSave} onClick={saveNick}>Save</button>
                <button className={styles.requesterNickCancel} onClick={cancelNickEdit}>Cancel</button>
                {r.nickname && (
                  <button className={styles.requesterNickCancel} onClick={() => onSaveNickname(r.clientId, '')}>Clear</button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className={styles.requesterNameRow}>
                {r.nickname
                  ? <span className={styles.requesterNickname}>{r.nickname}</span>
                  : <span className={styles.requesterName}>{r.displayName}</span>
                }
                <button className={styles.requesterNickBtn} onClick={openNickEdit} title="Set nickname">✎</button>
              </div>
              {r.nickname && <span className={styles.requesterNameSub}>{r.displayName}</span>}
              {r.isRegistered && <span className={styles.requesterBadge}>✓ Registered</span>}
            </>
          )}
        </div>
        <div className={styles.requesterStats}>
          <span className={styles.requesterStat}>{r.requestCount} req</span>
          {r.beatsSpent > 0 && <span className={styles.requesterStat}>{r.beatsSpent} beats</span>}
          {r.directTipCents > 0 && (
            <span className={styles.requesterStat}>${(r.directTipCents / 100).toFixed(2)} tipped</span>
          )}
        </div>
      </div>

      <div className={styles.requesterActions}>
        <button
          className={`${styles.requesterBtn} ${isDmOpen ? styles.requesterBtnActive : ''}`}
          onClick={() => onToggleDm(r.clientId)}
          title="Send direct message"
        >
          📩 DM
        </button>
        {r.isRegistered && r.email && (
          <button
            className={`${styles.requesterBtn} ${isGiftOpen ? styles.requesterBtnActive : ''}`}
            onClick={() => onToggleGift(r.clientId)}
            title="Gift beats"
          >
            🎁 Gift
          </button>
        )}
        <button
          className={`${styles.requesterBtn} ${r.suppressed ? styles.requesterBtnEnable : styles.requesterBtnSuppress}`}
          onClick={() => onToggleSuppress(r.clientId, !r.suppressed)}
        >
          {r.suppressed ? '✓ Re-enable' : '🚫 Suppress'}
        </button>
      </div>

      {isDmOpen && (
        <div className={styles.requesterExpand}>
          <textarea
            className={styles.requesterTextarea}
            placeholder="Type a message…"
            value={dmText}
            onChange={e => setDmText(e.target.value)}
            rows={2}
            maxLength={200}
            autoFocus
          />
          <div className={styles.requesterExpandRow}>
            <div className={styles.msgDurations}>
              {DM_DURATIONS.map(d => (
                <button
                  key={d.label}
                  className={`${styles.msgDuration} ${dmDuration === d.seconds ? styles.msgDurationActive : ''}`}
                  onClick={() => setDmDuration(d.seconds)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <button
              className={styles.requesterSendBtn}
              onClick={() => onSendDm(r)}
              disabled={!dmText.trim() || dmSending}
            >
              {dmSending ? '…' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {isGiftOpen && (
        <div className={styles.requesterExpand}>
          <div className={styles.requesterGiftRow}>
            <input
              type="number"
              min="1"
              className={styles.requesterBeatsInput}
              placeholder="Beats"
              value={giftBeats}
              onChange={e => setGiftBeats(e.target.value)}
              autoFocus
            />
            {giftCost > 0 && (
              <span className={styles.requesterGiftCost}>
                ${(giftCost / 100).toFixed(2)} · {walletBalance >= giftCost
                  ? `balance $${(walletBalance / 100).toFixed(2)}`
                  : <span style={{ color: '#f87171' }}>need ${((giftCost - walletBalance) / 100).toFixed(2)} more</span>
                }
              </span>
            )}
          </div>
          <textarea
            className={styles.requesterTextarea}
            placeholder="Add a message (optional)…"
            value={giftMessage}
            onChange={e => setGiftMessage(e.target.value)}
            rows={2}
            maxLength={160}
          />
          {giftError && <p className={styles.requesterGiftError}>{giftError}</p>}
          <button
            className={styles.requesterSendBtn}
            onClick={() => onSendGift(r.email)}
            disabled={!giftBeats || parseInt(giftBeats) < 1 || walletBalance < giftCost || giftSending}
          >
            {giftSending ? '…' : 'Gift Beats'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function RequestersPanel({ workingSession, mutateSessions }) {
  const sessionId = workingSession?._id ? String(workingSession._id) : null;

  const { data, mutate } = useSWR(
    sessionId ? `/api/dj/requesters?sessionId=${sessionId}` : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  const { data: walletData } = useSWR('/api/dj/wallet', fetcher, { revalidateOnFocus: false });
  const walletBalance = walletData?.balance ?? 0;

  const [expandedDm, setExpandedDm] = useState(null);
  const [dmText, setDmText] = useState('');
  const [dmDuration, setDmDuration] = useState(null);
  const [dmSending, setDmSending] = useState(false);

  const [expandedGift, setExpandedGift] = useState(null);
  const [giftBeats, setGiftBeats] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [giftSending, setGiftSending] = useState(false);
  const [giftError, setGiftError] = useState('');

  const requesters = data?.requesters ?? [];
  const active = requesters.filter(r => !r.suppressed);
  const suppressed = requesters.filter(r => r.suppressed);

  async function toggleSuppress(clientId, suppress) {
    await fetch('/api/dj/requesters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, clientId, suppress }),
    });
    mutate();
    mutateSessions?.();
  }

  async function sendDm(r) {
    if (!dmText.trim()) return;
    setDmSending(true);
    const body = r.isRegistered
      ? { recipientId: r.clientId, text: dmText.trim(), duration: dmDuration }
      : { recipientClientId: r.clientId, text: dmText.trim(), duration: dmDuration };
    await fetch('/api/dj/direct-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setDmText('');
    setDmDuration(null);
    setExpandedDm(null);
    setDmSending(false);
  }

  async function sendGift(recipientEmail) {
    const b = parseInt(giftBeats, 10);
    if (!b || b < 1) return;
    setGiftError('');
    setGiftSending(true);
    try {
      const res = await fetch('/api/dj/gift-beats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail, beats: b, message: giftMessage.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setGiftError(json.error || 'Gift failed'); return; }
      setGiftBeats('');
      setGiftMessage('');
      setExpandedGift(null);
    } finally {
      setGiftSending(false);
    }
  }

  function toggleDm(clientId) {
    setExpandedDm(prev => prev === clientId ? null : clientId);
    setDmText('');
    setDmDuration(null);
    setExpandedGift(null);
  }

  function toggleGift(clientId) {
    setExpandedGift(prev => prev === clientId ? null : clientId);
    setGiftBeats('');
    setGiftMessage('');
    setGiftError('');
    setExpandedDm(null);
  }

  async function saveNickname(clientId, nickname) {
    await fetch('/api/dj/requesters', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, nickname }),
    });
    mutate();
  }

  const cardProps = {
    walletBalance,
    expandedDm, expandedGift,
    dmText, setDmText, dmDuration, setDmDuration, dmSending,
    giftBeats, setGiftBeats, giftMessage, setGiftMessage, giftSending, giftError,
    onToggleDm: toggleDm,
    onToggleGift: toggleGift,
    onToggleSuppress: toggleSuppress,
    onSendDm: sendDm,
    onSendGift: sendGift,
    onSaveNickname: saveNickname,
  };

  if (!workingSession) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelHead}><span className={styles.panelTitle}>Requesters</span></div>
        <div className={styles.panelBody}><p className={styles.empty}>No active session.</p></div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Requesters</span>
        {active.length > 0 && <span className={styles.colCount}>{active.length}</span>}
      </div>
      <div className={styles.panelBody} style={{ padding: 0 }}>
        {active.length === 0 && suppressed.length === 0 ? (
          <p className={styles.empty} style={{ padding: '12px 14px' }}>No active requesters yet.</p>
        ) : (
          <>
            {active.map(r => <RequesterCard key={r.clientId} r={r} {...cardProps} />)}

            {suppressed.length > 0 && (
              <>
                <p className={styles.notifSection} style={{ marginTop: 8 }}>Suppressed</p>
                {suppressed.map(r => <RequesterCard key={r.clientId} r={r} {...cardProps} />)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
