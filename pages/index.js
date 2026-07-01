import Head from 'next/head';
import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import { SESSION_DURATIONS } from '../lib/dj/sessionPricing';
import styles from './index.module.css';

export default function Home() {
  const { data: session, status } = useSession();
  const isLoaded = status !== 'loading';
  const isSignedIn = !!session;

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
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>How it works</h2>
          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.stepNum}>1</div>
              <div className={styles.stepIcon}>🖥️</div>
              <h3 className={styles.stepHead}>Open the feed on a projector</h3>
              <p className={styles.stepText}>
                Start a session and open the feed screen on any TV or projector.
                It shows your live dance queue and a QR code the room can see.
              </p>
            </div>
            <div className={styles.stepDivider}>→</div>
            <div className={styles.step}>
              <div className={styles.stepNum}>2</div>
              <div className={styles.stepIcon}>📱</div>
              <h3 className={styles.stepHead}>Attendees scan and request</h3>
              <p className={styles.stepText}>
                Attendees scan the QR code with their phone camera — no app to download.
                They search for a dance and submit their request in seconds.
              </p>
            </div>
            <div className={styles.stepDivider}>→</div>
            <div className={styles.step}>
              <div className={styles.stepNum}>3</div>
              <div className={styles.stepIcon}>🎛️</div>
              <h3 className={styles.stepHead}>You control the queue</h3>
              <p className={styles.stepText}>
                Review incoming requests, approve the ones you want, and mark dances
                as played. The feed updates live for everyone in the room.
              </p>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Built for the dance floor</h2>
          <div className={styles.features}>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>⚡</span>
              <div>
                <h4 className={styles.featureHead}>No app required for attendees</h4>
                <p className={styles.featureText}>Attendees use their phone's built-in camera. Nothing to install, no account needed.</p>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>♫</span>
              <div>
                <h4 className={styles.featureHead}>Beat tipping</h4>
                <p className={styles.featureText}>Attendees can buy Beats to tip on specific requests and move them up in the queue — no processing fee on tips.</p>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>📺</span>
              <div>
                <h4 className={styles.featureHead}>Live queue display</h4>
                <p className={styles.featureText}>The feed screen shows what's playing and what's coming up next, keeping the whole room engaged.</p>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>💳</span>
              <div>
                <h4 className={styles.featureHead}>Pay per session, not per month</h4>
                <p className={styles.featureText}>No subscription. Start a session when you need it and pay only for the time you use.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Simple pricing</h2>
          <p className={styles.pricingDesc}>One-time charge per session. No subscription, no hidden fees.</p>
          <div className={styles.pricingGrid}>
            {SESSION_DURATIONS.map(tier => (
              <div key={tier.minutes} className={styles.priceTile}>
                <span className={styles.priceLabel}>{tier.label}</span>
                <span className={styles.priceAmount}>${(tier.priceCents / 100).toFixed(0)}</span>
              </div>
            ))}
          </div>
          <p className={styles.pricingNote}>Extend by the hour for $1 if you need more time.</p>
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
