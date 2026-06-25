import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import sp from '../../pages/dj-spotify/dj-spotify.module.css';

export default function TopBar({ activeSession, closeSession, isSpotify, spotifyConnected, onShowSessions, timeState, countdown }) {
  const [showHamburger, setShowHamburger] = useState(false);
  const hamburgerRef = useRef(null);

  useEffect(() => {
    if (!showHamburger) return;
    function handleClickOutside(e) {
      if (hamburgerRef.current && !hamburgerRef.current.contains(e.target)) {
        setShowHamburger(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHamburger]);

  return (
    <header className={styles.topBar}>
      {/* App name — full on wide screens, icon-only on narrow */}
      <span className={styles.appName}>
        <span className={styles.appNameFull}>🎛️ DJ Controller</span>
        <span className={styles.appNameShort}>🎛️</span>
      </span>

      {/* Session identity — always visible, truncates when tight */}
      <div className={styles.topBarSession}>
        {activeSession ? (
          <>
            <span className={styles.sessionBarDot} />
            <span className={styles.topBarSessionName}>{activeSession.name}</span>
            {activeSession.endsAt && (
              <span className={styles.topBarEndsAt}>
                {timeState && timeState !== 'active'
                  ? countdown
                  : `ends ${new Date(activeSession.endsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
              </span>
            )}
            <button className={styles.topBarEndBtn} onClick={closeSession}>End</button>
          </>
        ) : (
          <>
            <span className={styles.topBarNoSession}>No active session</span>
            <Link href="/start" className={styles.topBarNewBtn}>+ Start Session</Link>
          </>
        )}
      </div>

      <div className={styles.topBarNav}>
        {/* Primary nav — Feed + Requests (hidden below 900px) */}
        {activeSession && (
          <div className={styles.topBarNavPrimary}>
            <button className={styles.topBarNavBtn} onClick={() => window.open(`/feed/${activeSession.slug}`, '_blank')}>Feed ↗</button>
            <button className={styles.topBarNavBtn} onClick={() => window.open(`/request/${activeSession.slug}`, '_blank')}>Requests ↗</button>
          </div>
        )}
        {/* Secondary nav — History + Wallet (hidden below 1100px) */}
        <div className={styles.topBarNavSecondary}>
          {isSpotify && (
            spotifyConnected
              ? <span className={sp.spotifyChip}>● Spotify</span>
              : <a href="/api/spotify/auth" className={sp.spotifyChipOff}>Connect Spotify</a>
          )}
          <button className={styles.topBarNavBtn} onClick={onShowSessions}>History</button>
          {process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true' && (
            <Link href="/dj-profile" className={styles.topBarNavLink}>Wallet</Link>
          )}
        </div>
        {/* Hamburger — appears when items are hidden (below 1100px) */}
        <div className={styles.hamburgerWrap} ref={hamburgerRef}>
          <button
            className={styles.hamburgerBtn}
            onClick={() => setShowHamburger(v => !v)}
            aria-label="More options"
          >
            ☰
          </button>
          {showHamburger && (
            <div className={styles.hamburgerMenu}>
              {activeSession && (
                <>
                  <button className={styles.hamburgerItem} onClick={() => { window.open(`/feed/${activeSession.slug}`, '_blank'); setShowHamburger(false); }}>Feed ↗</button>
                  <button className={styles.hamburgerItem} onClick={() => { window.open(`/request/${activeSession.slug}`, '_blank'); setShowHamburger(false); }}>Requests ↗</button>
                  <div className={styles.hamburgerDivider} />
                </>
              )}
              <button className={styles.hamburgerItem} onClick={() => { onShowSessions(); setShowHamburger(false); }}>History</button>
              {process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true' && (
                <Link className={styles.hamburgerItem} href="/dj-profile" onClick={() => setShowHamburger(false)}>Wallet</Link>
              )}
              {isSpotify && !spotifyConnected && (
                <><div className={styles.hamburgerDivider} />
                <a className={styles.hamburgerItem} href="/api/spotify/auth" onClick={() => setShowHamburger(false)}>Connect Spotify</a></>
              )}
            </div>
          )}
        </div>
        <div className={styles.sessionBarUser}>
          <button className={styles.topBarNavBtn} onClick={() => signOut({ callbackUrl: '/' })}>Sign out</button>
        </div>
      </div>
    </header>
  );
}
