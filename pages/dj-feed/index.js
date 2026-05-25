import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import styles from './dj-feed.module.css';
import { remainingMs } from '../../lib/client/dj/autoAdvance';
import { StandardAdapter } from '../../lib/client/dj/controllerAdapters';

const QRCodeSVG = dynamic(() => import('qrcode.react').then(m => m.QRCodeSVG), { ssr: false });

const fetcher = url => fetch(url).then(r => r.json());

const DIFF_COLORS = {
  beginner: '#22c55e',
  improver: '#3b82f6',
  intermediate: '#f59e0b',
  advanced: '#ef4444',
};

function diffColor(d = '') {
  const key = Object.keys(DIFF_COLORS).find(k => d.toLowerCase().includes(k));
  return key ? DIFF_COLORS[key] : '#8A5CFF';
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function formatTime(ms_offset) {
  const d = new Date(Date.now() + ms_offset);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function DJFeedPage() {
  const { query } = useRouter();
  const sessionId = query.sessionId ?? null;
  const requestsUrl = sessionId ? `/api/dj/requests?sessionId=${sessionId}` : '/api/dj/requests';

  const [requestUrl, setRequestUrl] = useState('');
  useEffect(() => {
    setRequestUrl(`${window.location.origin}/dj-request`);
  }, []);

  const { data: requests = [], mutate } = useSWR(requestsUrl, fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
    dedupingInterval: 2000,
  });

  const messagesUrl = sessionId ? `/api/dj/messages?sessionId=${sessionId}` : '/api/dj/messages';
  const { data: msgData } = useSWR(messagesUrl, fetcher, { refreshInterval: 3000, dedupingInterval: 3000 });
  const activeMessage = (() => {
    const m = msgData?.message;
    if (!m) return null;
    if (m.expiresAt && new Date(m.expiresAt) <= new Date()) return null;
    return m;
  })();

  const [msgProgress, setMsgProgress] = useState(100);
  useEffect(() => {
    if (!activeMessage?.expiresAt) { setMsgProgress(100); return; }
    const total = activeMessage.duration * 1000;
    const update = () => {
      const remaining = new Date(activeMessage.expiresAt) - new Date();
      setMsgProgress(Math.max(0, (remaining / total) * 100));
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [activeMessage?._id, activeMessage?.expiresAt, activeMessage?.duration]);

  const [progress, setProgress] = useState(100);

  const playing = requests.find(r => r.status === 'playing') ?? null;
  const upcoming = requests
    .filter(r => r.status === 'approved')
    .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))
    .slice(0, 4);
  const unifiedQueue = playing ? [playing, ...upcoming] : upcoming;

  // Advance to next track: mark current played, promote first approved to playing
  const advanceQueue = useCallback(async (currentId) => {
    const snap = await fetch(requestsUrl).then(r => r.json());
    const stillPlaying = snap.find(r => r._id === currentId && r.status === 'playing');
    if (!stillPlaying) return; // already advanced by another tab
    await fetch(`/api/dj/requests/${currentId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'played' }),
    });
    const next = snap.filter(r => r.status === 'approved').sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))[0];
    if (next) {
      await fetch(`/api/dj/requests/${next._id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'playing', playStartedAt: new Date().toISOString() }),
      });
    }
    mutate();
  }, [mutate]);

  const isPaused = !!(playing?.pausedAt);

  // Auto-advance timer — fires when the countdown reaches zero.
  // Disabled for Spotify-managed tracks (spotifyUri set): the Spotify controller's
  // polling handles advancement for those.  See lib/client/dj/autoAdvance.js.
  useEffect(() => {
    if (!StandardAdapter.shouldAutoAdvance(playing)) return;
    const remaining = remainingMs(playing);
    if (remaining === 0) { advanceQueue(playing._id); return; }
    const t = setTimeout(() => advanceQueue(playing._id), remaining);
    return () => clearTimeout(t);
  }, [playing?._id, playing?.playStartedAt, playing?.duration_ms, playing?.spotifyUri, playing?.pausedAt, advanceQueue]);

  // Progress bar — freezes when paused
  useEffect(() => {
    if (!playing?.playStartedAt) { setProgress(100); return; }
    const total = playing.duration_ms ?? 180000;
    const update = () => {
      const ref = isPaused ? new Date(playing.pausedAt) : new Date();
      const elapsed = ref - new Date(playing.playStartedAt);
      setProgress(Math.max(0, 100 - (elapsed / total) * 100));
    };
    update();
    if (isPaused) return;
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [playing?._id, playing?.playStartedAt, playing?.pausedAt, playing?.duration_ms, isPaused]);

  // Cumulative start times — first upcoming item starts after the playing track
  const upcomingWithTimes = (() => {
    let cumMs = unifiedQueue[0]?.duration_ms ?? 180000;
    return unifiedQueue.slice(1).map((r, idx) => {
      const startTime = formatTime(cumMs);
      cumMs += r.duration_ms ?? 180000;
      return { ...r, startTime, num: idx + 1 };
    });
  })();

  const first = unifiedQueue[0] ?? null;

  return (
    <>
      <Head>
        <title>DJ Request Feed</title>
      </Head>

      <div className={styles.page}>
        {/* ── Left: QR + instructions ── */}
        <div className={styles.left}>
          <h1 className={styles.title}>Request a Dance</h1>

          <div className={styles.qrWrap}>
            {requestUrl ? (
              <QRCodeSVG
                value={requestUrl}
                size={220}
                bgColor="#ffffff"
                fgColor="#1a1033"
                level="M"
              />
            ) : (
              <div className={styles.qrPlaceholder} />
            )}
          </div>

          <p className={styles.urlHint}>{requestUrl}</p>

          <ol className={styles.steps}>
            <li><span className={styles.stepNum}>1</span><span>Scan the QR code with your phone</span></li>
            <li><span className={styles.stepNum}>2</span><span>Search for a dance you&apos;d like to see</span></li>
            <li><span className={styles.stepNum}>3</span><span>Submit your request!</span></li>
          </ol>
        </div>

        {/* ── Right: Queue ── */}
        <div className={styles.right}>
          {activeMessage && (
            <div className={styles.messageBanner}>
              <div className={styles.messageText}>{activeMessage.text}</div>
              {activeMessage.expiresAt && (
                <div className={styles.messageTimer}>
                  <div className={styles.messageTimerFill} style={{ width: `${msgProgress}%` }} />
                </div>
              )}
            </div>
          )}
          {!first ? (
            <p className={styles.empty}>No requests yet — scan the QR code to add one!</p>
          ) : (
            <>
              {/* Playing card */}
              {(() => {
                const isQueueMsg = first.danceType === 'message';
                if (isQueueMsg) {
                  return (
                    <div className={styles.queueMsgPlaying}>
                      <div className={styles.queueMsgIcon}>💬</div>
                      <div className={styles.queueMsgText}>{first.danceName}</div>
                      {first.playStartedAt && (
                        <div className={styles.progressBar}>
                          <div className={styles.progressFill} style={{ width: `${progress}%`, background: 'rgba(255,255,255,0.35)' }} />
                        </div>
                      )}
                    </div>
                  );
                }
                const isPartner = first.danceType === 'partner';
                // Partner dances use neutral white — no difficulty colour implied
                const dc = isPartner ? null
                  : first.difficulty ? diffColor(first.difficulty)
                  : '#8A5CFF';
                return (
                  <div
                    className={styles.queueItemPlaying}
                    style={dc ? {
                      borderLeftColor: dc,
                      borderLeftWidth: '6px',
                      background: `rgba(${hexToRgb(dc)}, 0.18)`,
                      boxShadow: `inset 4px 0 32px rgba(${hexToRgb(dc)}, 0.12), 0 0 40px rgba(${hexToRgb(dc)}, 0.08)`,
                    } : {
                      borderLeftColor: 'rgba(255,255,255,0.35)',
                      borderLeftWidth: '6px',
                      background: 'rgba(255,255,255,0.04)',
                      boxShadow: 'inset 4px 0 24px rgba(255,255,255,0.04)',
                    }}
                  >
                    <div className={styles.playingTop}>
                      <div className={styles.playingLabel}>
                        {!isPaused && (
                          <span
                            className={styles.playingDot}
                            style={dc
                              ? { background: dc, boxShadow: `0 0 0 0 ${dc}99` }
                              : { background: 'rgba(255,255,255,0.7)' }}
                            aria-label="Playing"
                          />
                        )}
                        <span className={styles.statusLabel}>{isPaused ? 'Paused' : 'Playing'}</span>
                      </div>
                      <div className={styles.playingBadges}>
                        {isPartner && (
                          <span className={styles.partnerBadge}>
                            👫 Partner{first.partnerStyle ? ` — ${first.partnerStyle}` : ''}
                          </span>
                        )}
                        {first.isSongSwap && (
                          <span className={styles.swapChip}>↻ Song Swap</span>
                        )}
                      </div>
                    </div>
                    <div className={styles.queueDancePlaying}>{first.danceName}</div>
                    {first.isSongSwap && first.swapSongName && (
                      <div className={styles.swapSongLine}>
                        <span className={styles.swapArrow}>↪</span>
                        <span className={styles.swapSongName}>{first.swapSongName}</span>
                        {first.swapArtist && <span className={styles.swapSongArtist}>{first.swapArtist}</span>}
                      </div>
                    )}
                    {first.playStartedAt && (
                      <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ width: `${progress}%`, background: dc ?? 'rgba(255,255,255,0.45)' }} />
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Up Next header + numbered list */}
              {upcomingWithTimes.length > 0 && (
                <>
                  <div className={styles.upNextHeader}>
                    <span className={styles.upNextDot} />
                    <span className={styles.statusLabel}>Up Next</span>
                  </div>

                  <ol className={styles.queueList}>
                    {upcomingWithTimes.map(r => (
                      <li key={r._id} className={`${styles.queueItem} ${r.isSongSwap ? styles.queueItemSwap : ''} ${r.danceType === 'message' ? styles.queueItemMsg : ''}`}>
                        <span className={styles.queueNum}>{r.danceType === 'message' ? '💬' : r.num}</span>
                        <span className={styles.queueDanceCol}>
                          <span className={styles.queueDance}>{r.danceName}</span>
                          {r.isSongSwap && r.swapSongName && (
                            <span className={styles.queueSwapRow}>↪ {r.swapSongName}</span>
                          )}
                        </span>
                        <div className={styles.queueRight}>
                          {r.danceType !== 'message' && <span className={styles.queueTime}>{r.startTime}</span>}
                          {r.danceType === 'message' ? null
                            : r.danceType === 'partner' ? (
                              <span className={styles.diffPip} style={{ background: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.25)' }}>
                                {r.partnerStyle || 'Partner'}
                              </span>
                            ) : r.difficulty ? (
                              <span className={styles.diffPip} style={{ background: diffColor(r.difficulty) }}>
                                {r.difficulty}
                              </span>
                            ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
