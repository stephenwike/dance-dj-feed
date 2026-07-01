import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
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

// ── Mockup: Feed Screen ───────────────────────────────────────────────────────
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

// ── Mockup: Phone Request ─────────────────────────────────────────────────────
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

// ── Mockup: DJ Controller ─────────────────────────────────────────────────────
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

// ── Mockup: Controller detail ─────────────────────────────────────────────────
function CtrlDetailMockup() {
  return (
    <div className={styles.ctrlDetail}>
      <div className={styles.ctrlDetailSidebar}>
        <div className={`${styles.ctrlDetailSideBtn} ${styles.ctrlDetailSideBtnActive}`}>📥</div>
        <div className={styles.ctrlDetailSideBtn}>📋</div>
        <div className={styles.ctrlDetailSideBtn}>💬</div>
        <div className={styles.ctrlDetailSideBtn}>⚙️</div>
      </div>
      <div className={styles.ctrlDetailCol}>
        <div className={styles.ctrlDetailColHead}>By Dance</div>
        <div className={styles.ctrlDetailPending}>
          <div>
            <div className={styles.ctrlDetailPendingName}>Electric Slide</div>
            <div className={styles.ctrlDetailPendingMeta}>6 requests · top scored</div>
          </div>
          <button className={styles.ctrlDetailApprove}>✓ Approve</button>
        </div>
        <div className={`${styles.ctrlDetailPending} ${styles.ctrlDetailPendingDim}`}>
          <div>
            <div className={styles.ctrlDetailPendingName}>Tush Push</div>
            <div className={styles.ctrlDetailPendingMeta}>3 requests</div>
          </div>
          <button className={styles.ctrlDetailApprove}>✓ Approve</button>
        </div>
        <div className={`${styles.ctrlDetailPending} ${styles.ctrlDetailPendingDim}`} style={{opacity:0.35}}>
          <div>
            <div className={styles.ctrlDetailPendingName}>Boot Scootin&apos; Boogie</div>
            <div className={styles.ctrlDetailPendingMeta}>2 requests</div>
          </div>
          <button className={styles.ctrlDetailApprove}>✓ Approve</button>
        </div>
      </div>
      <div className={styles.ctrlDetailCol}>
        <div className={styles.ctrlDetailColHead}>Queue</div>
        <div className={styles.ctrlDetailQueuePlaying}>
          <span className={styles.ctrlDetailQueueDot} />
          <span>Electric Slide</span>
          <span className={styles.ctrlDetailNowBadge}>NOW</span>
        </div>
        <div className={styles.ctrlDetailQueueItem}>
          <span className={styles.ctrlDetailQueuePos}>1</span>
          Tush Push
        </div>
        <div className={`${styles.ctrlDetailQueueItem} ${styles.ctrlDetailQueueItemDim}`}>
          <span className={styles.ctrlDetailQueuePos}>2</span>
          Copperhead Road
        </div>
      </div>
    </div>
  );
}

// ── Mockup: Request app detail ────────────────────────────────────────────────
function RequestDetailMockup() {
  return (
    <div className={styles.reqDetail}>
      <div className={styles.reqDetailNotch} />
      <div className={styles.reqDetailSearch}>
        <span className={styles.reqDetailSearchIcon}>⌕</span>
        <span className={styles.reqDetailSearchText}>Tush Push</span>
      </div>
      <div className={styles.reqDetailResult}>
        <div className={styles.reqDetailResultName}>Tush Push</div>
        <div className={styles.reqDetailResultMeta}>Line Dance · Intermediate</div>
      </div>
      <button className={styles.reqDetailBtn}>Request this dance →</button>
      <div className={styles.reqDetailDivider}>or</div>
      <div className={styles.reqDetailTip}>
        <div className={styles.reqDetailTipRow}>
          <span className={styles.reqDetailTipIcon}>⚡</span>
          <div>
            <div className={styles.reqDetailTipName}>Tip with Beats</div>
            <div className={styles.reqDetailTipDesc}>Move it up the queue</div>
          </div>
        </div>
        <div className={styles.reqDetailBeatBtns}>
          <button className={styles.reqDetailBeatBtn}>5 ⚡</button>
          <button className={`${styles.reqDetailBeatBtn} ${styles.reqDetailBeatBtnActive}`}>10 ⚡</button>
          <button className={styles.reqDetailBeatBtn}>20 ⚡</button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const { data: session, status } = useSession();
  const isLoaded = status !== 'loading';
  const isSignedIn = !!session;

  const [demoStep, setDemoStep] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDemoStep(s => (s + 1) % DEMO_STEPS.length), STEP_MS);
    return () => clearTimeout(t);
  }, [demoStep]);

  function pickStep(i) { setDemoStep(i); }

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

        {/* ── How it works (interactive demo) ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>How it works</h2>

          {/* Step pills */}
          <div className={styles.demoPills}>
            {DEMO_STEPS.map((s, i) => (
              <button
                key={i}
                className={`${styles.demoPill} ${demoStep === i ? styles.demoPillActive : ''} ${demoStep > i ? styles.demoPillDone : ''}`}
                onClick={() => pickStep(i)}
              >
                <span className={styles.demoPillNum}>{i + 1}</span>
                <span className={styles.demoPillLabel}>{s.pill}</span>
                {demoStep === i && <div key={demoStep} className={styles.demoPillBar} />}
              </button>
            ))}
          </div>

          {/* Demo stage */}
          <div className={styles.demoStage}>
            <div key={demoStep} className={styles.demoMockupWrap}>
              {demoStep === 0 && <FeedMockup />}
              {demoStep === 1 && <PhoneMockup />}
              {demoStep === 2 && <ControllerMockup />}
            </div>
          </div>

          {/* Step description */}
          <p key={demoStep} className={styles.demoDesc}>{DEMO_STEPS[demoStep].desc}</p>
        </section>

        {/* ── Using the Controller ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Using the controller</h2>
          <div className={styles.featureSplit}>
            <div className={styles.featureSplitVisual}>
              <CtrlDetailMockup />
            </div>
            <ul className={styles.featureList}>
              <li className={styles.featureItem}>
                <span className={styles.featureItemIcon}>📥</span>
                <div>
                  <strong>Requests grouped by dance</strong>
                  <p>See which dances have the most support and who&apos;s asking. Smart weighting balances regulars against newcomers.</p>
                </div>
              </li>
              <li className={styles.featureItem}>
                <span className={styles.featureItemIcon}>✓</span>
                <div>
                  <strong>One-tap approve</strong>
                  <p>Approve a request and it lands in your queue instantly. Reject or ignore — your call, every time.</p>
                </div>
              </li>
              <li className={styles.featureItem}>
                <span className={styles.featureItemIcon}>↕</span>
                <div>
                  <strong>Drag to reorder</strong>
                  <p>Shuffle the queue on the fly. Promote a crowd favourite or push something back — the feed updates live.</p>
                </div>
              </li>
              <li className={styles.featureItem}>
                <span className={styles.featureItemIcon}>📢</span>
                <div>
                  <strong>Announcements</strong>
                  <p>Push a message to the feed screen — break time, raffle winners, or anything the room needs to see.</p>
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* ── Using the Request App ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Using the request app</h2>
          <div className={`${styles.featureSplit} ${styles.featureSplitReverse}`}>
            <div className={styles.featureSplitVisual}>
              <RequestDetailMockup />
            </div>
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
        </section>

        {/* ── Pricing ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Simple pricing</h2>
          <p className={styles.pricingDesc}>Pay per session — no subscription, no hidden fees.</p>
          <div className={styles.pricingGrid}>
            {SESSION_DURATIONS.map((tier, i) => (
              <div key={tier.minutes} className={`${styles.priceTile} ${i === 1 ? styles.priceTilePopular : ''}`}>
                {i === 1 && <span className={styles.popularBadge}>Most popular</span>}
                <span className={styles.priceAmount}>${(tier.priceCents / 100).toFixed(0)}</span>
                <span className={styles.priceLabel}>{tier.label}</span>
              </div>
            ))}
          </div>
          <ul className={styles.pricingIncludes}>
            <li>All features included — requests, queue, history, announcements</li>
            <li>Beat tipping enabled — you keep the proceeds after payment processing</li>
            <li>Extend by the hour for $1 if you need more time</li>
            <li>No subscription, cancel anytime</li>
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
