import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import styles from '../../pages/dj-controller/dj-controller.module.css';

export default function TopBar({
  activeSession, draftSession, workingSession, liveSessions = [],
  selectSession, closeSession, discardDraft, timeState, countdown,
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const isDraft = workingSession?.status === 'draft';
  const isActive = workingSession?.status === 'active';

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  function handleSelect(id) {
    selectSession(id);
    setDropdownOpen(false);
  }

  return (
    <header className={styles.topBar}>

      {/* ── Left: app name + session name ── */}
      <span className={styles.appName}>
        <span className={styles.appNameFull}>🎛️ DanceFeed</span>
        <span className={styles.appNameShort}>🎛️</span>
      </span>

      {workingSession ? (
        <div className={styles.sessionSwitchWrap} ref={dropdownRef}>
          <button
            type="button"
            className={styles.sessionSwitchTrigger}
            onClick={() => setDropdownOpen(v => !v)}
            aria-expanded={dropdownOpen}
          >
            {isActive && <span className={styles.sessionBarDot} />}
            {isDraft && <span className={styles.topBarDraftDot} />}
            <span className={styles.topBarSessionName}>{workingSession.name}</span>
            {isDraft && <span className={styles.topBarDraftBadge}>setup</span>}
            <span className={styles.sessionSwitchSep} />
            <span className={styles.sessionSwitchArrow}>{dropdownOpen ? '▲' : '▼'}</span>
          </button>

          {dropdownOpen && (
            <div className={styles.sessionDropdown}>
              {liveSessions.map(s => {
                const isSelected = s._id === workingSession._id;
                const live = s.status === 'active';
                return (
                  <button
                    key={s._id}
                    type="button"
                    className={`${styles.sessionDropdownItem} ${isSelected ? styles.sessionDropdownItemSelected : ''}`}
                    onClick={() => handleSelect(s._id)}
                  >
                    <span className={live ? styles.sessionBarDot : styles.topBarDraftDot} />
                    <span className={styles.sessionDropdownItemName}>{s.name}</span>
                    <span className={styles.sessionDropdownItemBadge}>
                      {live ? 'Live' : 'Setup'}
                    </span>
                    {isSelected && <span className={styles.sessionDropdownItemCheck}>✓</span>}
                  </button>
                );
              })}
              <Link
                href="/dj-session-config"
                className={styles.sessionDropdownCreate}
                onClick={() => setDropdownOpen(false)}
              >
                <span className={styles.sessionDropdownCreatePlus}>＋</span>
                Create Another Session
              </Link>
            </div>
          )}
        </div>
      ) : (
        <span className={styles.topBarNoSession}>No active session</span>
      )}

      {/* ── Spacer ── */}
      <span className={styles.topBarSpacer} />

      {/* ── Right: end time, action buttons, quick links ── */}
      <div className={styles.topBarRight}>
        {activeSession?.endsAt && (
          <span className={styles.topBarEndsAt}>
            {timeState && timeState !== 'active'
              ? countdown
              : `ends ${new Date(activeSession.endsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
          </span>
        )}
        {isActive && (
          <button className={styles.topBarEndBtn} onClick={closeSession}>End</button>
        )}
        {isDraft && (
          <>
            <Link href="/start" className={styles.topBarStartBtn}>▶ Start Event</Link>
            <button className={styles.topBarEndBtn} onClick={discardDraft}>Discard</button>
          </>
        )}
        {!workingSession && (
          <Link href="/start" className={styles.topBarNewBtn}>+ New Session</Link>
        )}
        {workingSession?.status === 'active' && (
          <>
            <button
              className={styles.topBarQuickBtn}
              onClick={() => window.open(`/feed-preview?sessionId=${workingSession._id}`, '_blank')}
            >
              🖥️ Feed ↗
            </button>
            <button
              className={styles.topBarQuickBtn}
              onClick={() => window.open(`/request/${workingSession.slug}`, '_blank')}
            >
              📱 Requests ↗
            </button>
          </>
        )}
        <Link href="/reports" className={styles.topBarQuickBtn}>📊 Reports</Link>
      </div>

    </header>
  );
}
