import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { SESSION_DURATIONS } from '../lib/dj/sessionPricing';
import styles from './index.module.css';

const DEMO_STEPS = [
  {
    pill: 'Open the feed',
    desc: 'Start a session and open the feed on any TV or projector. The room sees the live queue and a QR code they can scan.',
  },
  {
    pill: 'Scan & request',
    desc: 'Attendees scan the QR code with their phone camera — no app to download. They search for a dance and submit in seconds.',
  },
  {
    pill: 'You approve',
    desc: 'Incoming requests appear in your controller. Approve what you want, reorder the queue, and mark dances as played.',
  },
];
const STEP_MS = 4200;

const DIFF_COLORS = {
  Beginner:     '#22c55e',
  Intermediate: '#f59e0b',
  Advanced:     '#ef4444',
};

const DANCE_LIST = [
  { id: 1, name: 'Electric Slide',       diff: 'Beginner' },
  { id: 2, name: 'Tush Push',            diff: 'Intermediate' },
  { id: 3, name: 'Copperhead Road',      diff: 'Advanced' },
  { id: 4, name: 'Watermelon Crawl',     diff: 'Beginner' },
  { id: 5, name: "Boot Scootin' Boogie", diff: 'Beginner' },
  { id: 6, name: 'Cowboy Cha Cha',       diff: 'Intermediate' },
];

// ── Mockup: Feed Screen (used in "How it works" animated demo) ────────────────
function FeedMockup() {
  return (
    <div className={styles.feedMock}>
      <div className={styles.feedMockBar}>
        <span className={styles.feedMockDot} />
        <span className={styles.feedMockNow}>Now Playing</span>
        <span className={styles.feedMockTrack}>Watermelon Crawl</span>
      </div>
      <div className={styles.feedMockBody}>
        <div className={styles.feedMockQrWrap}>
          <div className={styles.feedMockQrPulse} />
          <div className={styles.feedMockQr}>
            <svg viewBox="0 0 7 7" width="72" height="72" shapeRendering="crispEdges">
              {[
                [1,1,1,0,1,0,1],
                [1,0,1,0,0,1,1],
                [1,1,1,0,1,0,0],
                [0,0,0,1,0,1,0],
                [1,0,1,1,1,0,1],
                [0,1,0,0,0,1,1],
                [1,1,0,1,0,1,0],
              ].map((row, y) => row.map((on, x) =>
                on ? <rect key={`${x}${y}`} x={x} y={y} width="1" height="1" fill="#1a1033" /> : null
              ))}
            </svg>
          </div>
        </div>
        <p className={styles.feedMockHint}>Scan to request a dance</p>
      </div>
      <div className={styles.feedMockQueue}>
        <div className={styles.feedMockQueueItem}>
          <span className={styles.feedMockQueuePos}>1</span>
          Electric Slide
        </div>
        <div className={`${styles.feedMockQueueItem} ${styles.feedMockQueueItemDim}`}>
          <span className={styles.feedMockQueuePos}>2</span>
          Boot Scootin&apos; Boogie
        </div>
      </div>
    </div>
  );
}

// ── Mockup: Phone Request (used in "How it works" animated demo) ──────────────
function PhoneMockup() {
  return (
    <div className={styles.phoneMock}>
      <div className={styles.phoneMockNotch} />
      <div className={styles.phoneMockSearch}>
        <span className={styles.phoneMockSearchIcon}>⌕</span>
        <span className={styles.phoneMockSearchText}>Electric Slide</span>
        <span className={styles.phoneMockCursor} />
      </div>
      <div className={styles.phoneMockResult}>
        <div className={styles.phoneMockResultName}>Electric Slide</div>
        <div className={styles.phoneMockResultMeta}>Line Dance · Intermediate</div>
      </div>
      <button className={styles.phoneMockBtn}>Request this dance →</button>
    </div>
  );
}

// ── Mockup: DJ Controller (used in "How it works" animated demo) ──────────────
function ControllerMockup() {
  return (
    <div className={styles.ctrlMock}>
      <div className={styles.ctrlMockSection}>
        <div className={styles.ctrlMockLabel}>📥 Incoming requests</div>
        <div className={styles.ctrlMockPending}>
          <div>
            <div className={styles.ctrlMockPendingName}>Electric Slide</div>
            <div className={styles.ctrlMockPendingMeta}>4 requests</div>
          </div>
          <button className={styles.ctrlMockApprove}>✓ Approve</button>
        </div>
      </div>
      <div className={styles.ctrlMockSection}>
        <div className={styles.ctrlMockLabel}>Queue</div>
        <div className={styles.ctrlMockQueued}>
          <span className={styles.ctrlMockQueuedName}>Electric Slide</span>
          <span className={styles.ctrlMockQueuedBadge}>Added!</span>
        </div>
      </div>
    </div>
  );
}

const TIER_BENEFITS = [
  'Warm-up or class',
  'Evening session',
  'Full night out',
  'Long event',
  'All-day event',
];

// ── How it works (tabbed explainer) ──────────────────────────────────────────
const STEP_ICONS = ['📺', '📱', '🎛️'];

function HowItWorksExplainer() {
  const [tab, setTab] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setTab(s => (s + 1) % DEMO_STEPS.length), STEP_MS);
    return () => clearTimeout(t);
  }, [tab]);

  const mockups = [
    <FeedMockup key="feed" />,
    <PhoneMockup key="phone" />,
    <ControllerMockup key="ctrl" />,
  ];

  return (
    <div className={styles.tipExplainer}>
      <div className={styles.tipTabs}>
        {DEMO_STEPS.map((s, i) => (
          <button
            key={i}
            className={`${styles.tipTab} ${tab === i ? styles.tipTabActive : ''}`}
            onClick={() => setTab(i)}
          >
            <span className={styles.tipTabIcon}>{STEP_ICONS[i]}</span>
            {s.pill}
            {tab === i && <div key={tab} className={styles.tipTabBar} />}
          </button>
        ))}
      </div>
      <div className={styles.tipPanel}>
        <div className={styles.tipSplit}>
          <div className={styles.tipVisual}>
            <div key={tab} className={styles.demoMockupWrap}>
              {mockups[tab]}
            </div>
          </div>
          <div className={styles.tipText}>
            <h3 className={styles.tipTextTitle}>{DEMO_STEPS[tab].pill}</h3>
            <p className={styles.tipTextBody}>{DEMO_STEPS[tab].desc}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tipping explainer ─────────────────────────────────────────────────────────
function TippingExplainer() {
  const [tab, setTab] = useState(0);
  const [tipAmount, setTipAmount] = useState(null);
  const [tipped, setTipped] = useState(false);

  function changeTab(i) { setTab(i); setTipAmount(null); setTipped(false); }

  useEffect(() => {
    const next = (tab + 1) % 3;
    const t = setTimeout(() => changeTab(next), STEP_MS);
    return () => clearTimeout(t);
  }, [tab]);

  return (
    <div className={styles.tipExplainer}>
      <div className={styles.tipTabs}>
        {[['♫', 'Beats'], ['¢', 'Tipping'], ['💸', 'Payouts']].map(([icon, label], i) => (
          <button
            key={label}
            className={`${styles.tipTab} ${tab === i ? styles.tipTabActive : ''}`}
            onClick={() => changeTab(i)}
          >
            <span className={styles.tipTabIcon} style={i === 0 ? { color: '#fbbf24' } : i === 1 ? { color: '#22c55e' } : undefined}>{icon}</span>
            {label}
            {tab === i && <div key={tab} className={styles.tipTabBar} />}
          </button>
        ))}
      </div>

      <div className={styles.tipPanel}>

        {/* ── Beats ── */}
        {tab === 0 && (
          <div className={styles.tipSplit}>
            <div className={styles.tipVisual}>
              <div className={styles.tipBeatsCard}>
                <div className={styles.tipBeatsCardTitle}>Get Beats</div>
                <div className={styles.tipBeatsCardSub}>Tip on your favourite dances</div>
                <div className={styles.tipBeatsPkgs}>
                  {[
                    { price: '$5',  beats: '50',  bonus: null,     tag: null },
                    { price: '$10', beats: '120', bonus: '+20',    tag: 'Popular' },
                    { price: '$20', beats: '250', bonus: '+50',    tag: 'Best value' },
                  ].map(pkg => (
                    <div key={pkg.price} className={`${styles.tipBeatsPkg} ${pkg.tag ? styles.tipBeatsPkgFeatured : ''}`}>
                      {pkg.tag && <span className={styles.tipBeatsPkgTag}>{pkg.tag}</span>}
                      <span className={styles.tipBeatsCount}>{pkg.beats} <span className={styles.tipBeatsIcon}>♫</span></span>
                      {pkg.bonus && <span className={styles.tipBeatsBonus}>{pkg.bonus} bonus</span>}
                      <span className={styles.tipBeatsPrice}>{pkg.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.tipText}>
              <h3 className={styles.tipTextTitle}>In-app currency for tipping</h3>
              <p className={styles.tipTextBody}>Attendees buy Beats with a card or Apple/Google Pay — no account needed. One Beat = $0.10 of real value going directly to you.</p>
              <p className={styles.tipTextBody}>Higher packages include bonus Beats, giving attendees more to tip with and more earnings for you.</p>
            </div>
          </div>
        )}

        {/* ── Tipping ── */}
        {tab === 1 && (
          <div className={styles.tipSplit}>
            <div className={styles.tipVisual}>
              {!tipped ? (
                <div className={styles.tipDemoCard}>
                  <div className={styles.tipDemoName}>Tush Push</div>
                  <div className={styles.tipDemoMeta}>3 requests · Intermediate</div>
                  <div className={styles.tipDemoPrompt}>Tip to move it up:</div>
                  <div className={styles.tipDemoBtns}>
                    {[5, 10, 20].map(n => (
                      <button
                        key={n}
                        className={`${styles.tipDemoBtn} ${tipAmount === n ? styles.tipDemoBtnSel : ''}`}
                        onClick={() => setTipAmount(n)}
                      >
                        {n} <span style={{ color: '#fbbf24' }}>♫</span>
                      </button>
                    ))}
                  </div>
                  {tipAmount && (
                    <button className={styles.tipDemoSendBtn} onClick={() => setTipped(true)}>
                      Send {tipAmount} <span style={{ color: '#fbbf24' }}>♫</span> →
                    </button>
                  )}
                </div>
              ) : (
                <div className={styles.tipDemoSuccess}>
                  <div className={styles.tipDemoSuccessIcon}>♫</div>
                  <div className={styles.tipDemoSuccessTitle}>Tip sent!</div>
                  <div className={styles.tipDemoSuccessSub}>Your request is now prioritised in the DJ&apos;s view</div>
                  <button className={styles.tipDemoResetBtn} onClick={() => { setTipAmount(null); setTipped(false); }}>
                    Try again
                  </button>
                </div>
              )}
            </div>
            <div className={styles.tipText}>
              <h3 className={styles.tipTextTitle}>Tips make requests stand out</h3>
              <p className={styles.tipTextBody}>When someone really wants to see a dance, they add Beats to their request. The tip shows up alongside the request in your controller.</p>
              <p className={styles.tipTextBody}>You&apos;re still in control — tips are a signal, not an override. You always decide what gets approved.</p>
            </div>
          </div>
        )}

        {/* ── Payouts ── */}
        {tab === 2 && (
          <div className={styles.tipSplit}>
            <div className={styles.tipVisual}>
              <div className={styles.tipPayoutCard}>
                <div className={styles.tipPayoutCardTitle}>Your Wallet</div>
                <div className={styles.tipPayoutRows}>
                  <div className={styles.tipPayoutRow}>
                    <span className={styles.tipPayoutRowLabel}>Session cost (8 hrs)</span>
                    <span className={styles.tipPayoutNeg}>−$6.00</span>
                  </div>
                  <div className={styles.tipPayoutRow}>
                    <span className={styles.tipPayoutRowLabel}>Tips collected</span>
                    <span className={styles.tipPayoutPos}>+$34.50</span>
                  </div>
                  <div className={`${styles.tipPayoutRow} ${styles.tipPayoutRowTotal}`}>
                    <span className={styles.tipPayoutRowLabel}>Take-home</span>
                    <span className={styles.tipPayoutPos}>+$28.50</span>
                  </div>
                </div>
                <button className={styles.tipPayoutBtn}>Payout to bank →</button>
                <div className={styles.tipPayoutNote}>Via Stripe · 2–3 business days</div>
              </div>
            </div>
            <div className={styles.tipText}>
              <h3 className={styles.tipTextTitle}>You keep the tips</h3>
              <p className={styles.tipTextBody}>Tips go directly to your connected Stripe account. DanceCard takes no cut — you keep everything after Stripe&apos;s payment processing fee.</p>
              <p className={styles.tipTextBody}>Request a payout any time from your wallet. Most DJs earn well above their session cost back from just a handful of tippers.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Interactive: DJ Controller ────────────────────────────────────────────────
function ControllerMock({ pending, queue, playing, onApprove, onMarkPlayed, onRemove }) {
  return (
    <div className={styles.ctrlFull}>
      <div className={styles.ctrlFullBar}>
        <span className={styles.ctrlFullTitle}>🎛️ DJ Controller</span>
        <span className={styles.ctrlFullSession}>Dance Night Demo</span>
        <span className={styles.ctrlFullLive}>
          <span className={styles.ctrlFullDot} />
          LIVE
        </span>
      </div>

      <div className={styles.ctrlFullBody}>
        <div className={styles.ctrlFullSidebar}>
          <button className={`${styles.ctrlFullSideBtn} ${styles.ctrlFullSideBtnActive}`}>📥</button>
          <button className={styles.ctrlFullSideBtn}>📋</button>
          <button className={styles.ctrlFullSideBtn}>💬</button>
          <button className={styles.ctrlFullSideBtn}>⚙️</button>
          <button className={styles.ctrlFullSideBtn}>💳</button>
        </div>

        {/* Left panel: pending requests */}
        <div className={styles.ctrlFullPanel}>
          <div className={styles.ctrlFullPanelHead}>
            <div className={styles.ctrlFullSegControl}>
              <button className={`${styles.ctrlFullSeg} ${styles.ctrlFullSegActive}`}>By Dance</button>
              <button className={styles.ctrlFullSeg}>By Requester</button>
            </div>
            {pending.length > 0 && (
              <span className={styles.ctrlFullBadge}>{pending.length}</span>
            )}
          </div>
          <div className={styles.ctrlFullPanelBody}>
            {pending.length === 0 ? (
              <div className={styles.ctrlFullEmpty}>
                <span className={styles.ctrlFullEmptyIcon}>📥</span>
                <span className={styles.ctrlFullEmptyTitle}>No pending requests yet</span>
                <span className={styles.ctrlFullEmptyHint}>Use the request app below to send some</span>
              </div>
            ) : pending.map(item => (
              <div key={item.id} className={styles.ctrlFullPendingCard}>
                <div className={styles.ctrlFullPendingLeft}>
                  <div className={styles.ctrlFullPendingName}>{item.name}</div>
                  <div className={styles.ctrlFullPendingMeta}>
                    {item.count} {item.count === 1 ? 'request' : 'requests'}
                    {' · '}
                    <span style={{ color: DIFF_COLORS[item.diff] }}>{item.diff}</span>
                  </div>
                </div>
                <button className={styles.ctrlFullApproveBtn} onClick={() => onApprove(item)}>
                  ✓ Approve
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel: queue */}
        <div className={styles.ctrlFullPanel}>
          <div className={styles.ctrlFullPanelHead}>
            <span className={styles.ctrlFullPanelTitle}>Queue</span>
            {(queue.length + (playing ? 1 : 0)) > 0 && (
              <span className={styles.ctrlFullBadge}>{queue.length + (playing ? 1 : 0)}</span>
            )}
          </div>
          <div className={styles.ctrlFullPanelBody}>
            {!playing && queue.length === 0 ? (
              <div className={styles.ctrlFullEmpty}>
                <span className={styles.ctrlFullEmptyIcon}>🎵</span>
                <span className={styles.ctrlFullEmptyTitle}>Queue is empty</span>
                <span className={styles.ctrlFullEmptyHint}>Approve requests to add dances here</span>
              </div>
            ) : (
              <>
                {playing && (
                  <div className={styles.ctrlFullPlayingCard}>
                    <div className={styles.ctrlFullPlayingLeft}>
                      <span className={styles.ctrlFullPlayingDot} />
                      <div>
                        <div className={styles.ctrlFullPlayingName}>{playing.name}</div>
                        <div className={styles.ctrlFullPlayingMeta}>Now playing</div>
                      </div>
                    </div>
                    <button className={styles.ctrlFullPlayedBtn} onClick={onMarkPlayed}>
                      ✓ Played
                    </button>
                  </div>
                )}
                {queue.map((item, i) => (
                  <div key={item.id} className={styles.ctrlFullQueueCard}>
                    <span className={styles.ctrlFullQueuePos}>{i + 1}</span>
                    <span className={styles.ctrlFullQueueName}>{item.name}</span>
                    <button className={styles.ctrlFullRemoveBtn} onClick={() => onRemove(item)}>✕</button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Interactive: Mini Feed ────────────────────────────────────────────────────
function MiniFeedMock({ playing, queue }) {
  return (
    <div className={styles.tvFeed}>
      <div className={styles.tvFeedTopBar}>
        <div className={styles.tvFeedLive}>
          <span className={styles.tvFeedDot} />
          LIVE
        </div>
      </div>
      <div className={styles.tvFeedBody}>
        {playing ? (
          <>
            <div className={styles.tvFeedNowLabel}>Now Playing</div>
            <div className={styles.tvFeedDanceName}>{playing.name}</div>
            <div className={styles.tvFeedDiff} style={{ color: DIFF_COLORS[playing.diff] }}>
              {playing.diff}
            </div>
            {queue.length > 0 && (
              <>
                <div className={styles.tvFeedDivider} />
                <div className={styles.tvFeedUpNextLabel}>Up Next</div>
                {queue.slice(0, 3).map((item, i) => (
                  <div key={item.id} className={styles.tvFeedQueueRow}>
                    <span className={styles.tvFeedQueueNum}>{i + 1}</span>
                    <span className={styles.tvFeedQueueName}>{item.name}</span>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <div className={styles.tvFeedEmpty}>No dances queued yet</div>
        )}
      </div>
    </div>
  );
}

// ── Interactive: Request App ──────────────────────────────────────────────────
function RequestAppMock({ onRequest }) {
  const [view, setView] = useState('list'); // 'list' | 'detail' | 'success'
  const [selected, setSelected] = useState(null);
  const timerRef = useRef(null);

  function handleSelect(dance) {
    setSelected(dance);
    setView('detail');
  }

  function handleRequest() {
    onRequest(selected);
    setView('success');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setView('list');
      setSelected(null);
    }, 2200);
  }

  function handleBack() {
    setView('list');
    setSelected(null);
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className={styles.reqApp}>
      <div className={styles.reqAppPhone}>
        <div className={styles.reqAppNotch} />
        <div className={styles.reqAppUrl}>dancecard.app/request/dance-night</div>

        {view === 'list' && (
          <>
            <div className={styles.reqAppHeader}>
              Tonight&apos;s<br />Dance Night
            </div>
            <div className={styles.reqAppPrompt}>What would you like to see?</div>
            <div className={styles.reqAppList}>
              {DANCE_LIST.map(d => (
                <button key={d.id} className={styles.reqAppListBtn} onClick={() => handleSelect(d)}>
                  <span className={styles.reqAppListName}>{d.name}</span>
                  <span className={styles.reqAppListDiff} style={{ color: DIFF_COLORS[d.diff] }}>
                    {d.diff}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {view === 'detail' && selected && (
          <>
            <button className={styles.reqAppBack} onClick={handleBack}>← Back</button>
            <div className={styles.reqAppDetailHeader}>{selected.name}</div>
            <div className={styles.reqAppDetailMeta}>
              Line Dance ·{' '}
              <span style={{ color: DIFF_COLORS[selected.diff] }}>{selected.diff}</span>
            </div>
            <button className={styles.reqAppRequestBtn} onClick={handleRequest}>
              Request this dance →
            </button>
          </>
        )}

        {view === 'success' && (
          <div className={styles.reqAppSuccess}>
            <div className={styles.reqAppSuccessIcon}>✓</div>
            <div className={styles.reqAppSuccessName}>{selected?.name}</div>
            <div className={styles.reqAppSuccessMsg}>Sent to the DJ!</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const { data: session, status } = useSession();
  const isLoaded = status !== 'loading';
  const isSignedIn = !!session;

  // Shared demo state — request app feeds the controller mock
  const [pending, setPending] = useState([
    { id: 2, name: 'Tush Push',        diff: 'Intermediate', count: 4 },
    { id: 3, name: 'Copperhead Road',  diff: 'Advanced',     count: 2 },
    { id: 6, name: 'Cowboy Cha Cha',   diff: 'Intermediate', count: 1 },
  ]);
  const [queue, setQueue] = useState([
    { id: 4, name: 'Watermelon Crawl',     diff: 'Beginner', count: 1 },
    { id: 5, name: "Boot Scootin' Boogie", diff: 'Beginner', count: 1 },
  ]);
  const [playing, setPlaying] = useState(
    { id: 1, name: 'Electric Slide', diff: 'Beginner', count: 1 }
  );

  function handleRequest(dance) {
    setPending(p => {
      const existing = p.find(r => r.id === dance.id);
      if (existing) return p.map(r => r.id === dance.id ? { ...r, count: r.count + 1 } : r);
      return [...p, { ...dance, count: 1 }];
    });
  }

  function handleApprove(item) {
    setPending(p => p.filter(d => d.id !== item.id));
    if (!playing) {
      setPlaying(item);
    } else {
      setQueue(q => [...q, item]);
    }
  }

  function handleMarkPlayed() {
    const next = queue[0] ?? null;
    setPlaying(next);
    setQueue(q => q.slice(1));
  }

  function handleRemove(item) {
    setQueue(q => q.filter(d => d.id !== item.id));
  }

  return (
    <>
      <Head><title>DanceCard — Live Request Platform for Line Dance DJs</title></Head>
      <div className={styles.page}>

        {/* ── Hero ── */}
        <section className={styles.hero}>
          <div className={styles.logo}>🎛️</div>
          <h1 className={styles.title}>DanceCard</h1>
          <p className={styles.tagline}>The live request platform for line dance DJs.</p>
          <p className={styles.heroDesc}>
            Attendees scan a QR code from their phone and submit dance requests in real time —
            no app to download. You approve, queue, and play from your own screen.
          </p>
          {isLoaded && (
            <div className={styles.heroActions}>
              {isSignedIn ? (
                <Link href="/start" className={styles.btnPrimary}>Start an Event →</Link>
              ) : (
                <>
                  <button className={styles.btnPrimary} onClick={() => signIn('ldco', { callbackUrl: '/start' })}>
                    Get Started
                  </button>
                  <button className={styles.btnSecondary} onClick={() => signIn('ldco', { callbackUrl: '/start' }, { prompt: 'login' })}>
                    Sign In
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        {/* ── How it works ── */}
        <section className={`${styles.section} ${styles.sectionWide}`}>
          <h2 className={styles.sectionTitle}>How it works</h2>
          <HowItWorksExplainer />
        </section>

        {/* ── Using the Controller ── */}
        <section className={`${styles.section} ${styles.sectionWide}`}>
          <h2 className={styles.sectionTitle}>Using the controller</h2>
          <ControllerMock
            pending={pending}
            queue={queue}
            playing={playing}
            onApprove={handleApprove}
            onMarkPlayed={handleMarkPlayed}
            onRemove={handleRemove}
          />
        </section>

        {/* ── Using the Request App ── */}
        <section className={`${styles.section} ${styles.sectionWide}`}>
          <h2 className={styles.sectionTitle}>Using the request app</h2>
          <div className={styles.reqAppRow}>
            <div className={styles.reqAppRowSide}>
              <ul className={styles.featureList}>
                <li className={styles.featureItem}>
                  <span className={styles.featureItemIcon}>📱</span>
                  <div>
                    <strong>No download required</strong>
                    <p>Attendees scan the QR code with their phone camera and the app opens in their browser — nothing to install.</p>
                  </div>
                </li>
                <li className={styles.featureItem}>
                  <span className={styles.featureItemIcon}>🔍</span>
                  <div>
                    <strong>Search any dance</strong>
                    <p>Type a dance name and submit in seconds. Results pull from the same library you use to run your sessions.</p>
                  </div>
                </li>
                <li className={styles.featureItem}>
                  <span className={styles.featureItemIcon}>⚡</span>
                  <div>
                    <strong>Beat tipping</strong>
                    <p>Attendees can buy Beats to tip on requests they want to see sooner. You keep the proceeds after payment processing.</p>
                  </div>
                </li>
                <li className={styles.featureItem}>
                  <span className={styles.featureItemIcon}>📺</span>
                  <div>
                    <strong>Watch the queue</strong>
                    <p>The feed screen shows what&apos;s playing and what&apos;s coming up, keeping the whole room in the loop.</p>
                  </div>
                </li>
              </ul>
            </div>
            <RequestAppMock onRequest={handleRequest} />
            <div className={styles.reqAppRowSide}>
              <MiniFeedMock playing={playing} queue={queue} />
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section className={`${styles.section} ${styles.sectionWide}`}>
          <h2 className={styles.sectionTitle}>Simple pricing</h2>
          <p className={styles.pricingDesc}>
            A flat fee per session covers hosting and API costs. Pick the length that fits your event.
          </p>
          <div className={styles.pricingGrid}>
            {SESSION_DURATIONS.map((tier, i) => (
              <div key={tier.minutes} className={`${styles.priceTile} ${i === 2 ? styles.priceTilePopular : ''}`}>
                {i === 2 && <span className={styles.popularBadge}>Most popular</span>}
                <span className={styles.priceBenefit}>{TIER_BENEFITS[i]}</span>
                <span className={styles.priceLabel}>{tier.label}</span>
                <span className={styles.priceAmount}>${(tier.priceCents / 100).toFixed(0)}</span>
              </div>
            ))}
          </div>

          <div className={styles.tipROIBanner}>
            <span className={styles.tipROIIcon}>💡</span>
            <div>
              <strong className={styles.tipROITitle}>You can make it all back</strong>
              <p className={styles.tipROISub}>
                Most DJs earn more than their session cost through Beat tips. One tipper covers an 8-hour session — a few more and you&apos;re ahead for the night.
              </p>
            </div>
          </div>

          <TippingExplainer />

          <ul className={styles.pricingIncludes}>
            <li>All features included — requests, queue, history, announcements</li>
            <li>Beat tipping enabled — you keep everything after payment processing</li>
            <li>Add hours as needed for $1/hour if your event runs long</li>
            <li>No subscription — pay only when you run a session</li>
          </ul>
        </section>

        {/* ── CTA ── */}
        <section className={styles.ctaSection}>
          <p className={styles.ctaText}>Ready to try it?</p>
          {isLoaded && (isSignedIn ? (
            <Link href="/start" className={styles.btnPrimary}>Start an Event →</Link>
          ) : (
            <button className={styles.btnPrimary} onClick={() => signIn('ldco', { callbackUrl: '/start' })}>
              Get Started
            </button>
          ))}
        </section>

        <footer className={styles.footer}>
          © 2026 DanceCard · Beyond Line Dance
        </footer>
      </div>
    </>
  );
}
