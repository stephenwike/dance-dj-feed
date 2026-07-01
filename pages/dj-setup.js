import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import styles from './dj-setup.module.css';

const QRCodeSVG = dynamic(() => import('qrcode.react').then(m => m.QRCodeSVG), { ssr: false });

const fetcher = url => fetch(url).then(r => r.json());
const CONTROLLER_PATH = '/dj-controller';
const STEPS = ['The Feed Screen', 'Attendees & Requests', 'Your Controller'];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button className={styles.copyBtn} onClick={handleCopy}>
      {copied ? '✓ Copied' : '📋 Copy Link'}
    </button>
  );
}

export default function DJSetupPage() {
  const router = useRouter();
  const { sessionId } = router.query;
  const [step, setStep] = useState(0);
  const [origin, setOrigin] = useState('');

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const { data: sessions } = useSWR('/api/dj/sessions', fetcher);
  const session = sessions?.find(s => String(s._id) === sessionId);
  const slug = session?.slug ?? null;

  const feedUrl    = slug ? `${origin}/feed/${slug}` : '';
  const requestUrl = slug ? `${origin}/request/${slug}` : '';

  function goToController() {
    router.push(CONTROLLER_PATH);
  }

  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else goToController();
  }

  function back() {
    setStep(s => s - 1);
  }

  return (
    <>
      <Head><title>Setup — DanceFeed</title></Head>
      <div className={styles.page}>
        <div className={styles.card}>

          {/* ── Header row ── */}
          <div className={styles.topRow}>
            <div className={styles.dots}>
              {STEPS.map((_, i) => (
                <span key={i} className={`${styles.dot} ${i === step ? styles.dotActive : i < step ? styles.dotDone : ''}`} />
              ))}
            </div>
            <button className={styles.skipBtn} onClick={goToController}>
              Skip setup →
            </button>
          </div>

          {/* ── Step 1: Feed Screen ── */}
          {step === 0 && (
            <div className={styles.stepBody}>
              <div className={styles.stepIcon}>🖥️</div>
              <h1 className={styles.stepTitle}>Open the Feed Screen</h1>
              <p className={styles.stepDesc}>
                The feed goes on a <strong>projector or TV</strong> that the whole room can see.
                It shows the live dance queue and a QR code attendees scan to submit requests.
              </p>
              {feedUrl ? (
                <>
                  <div className={styles.qrWrap}>
                    <QRCodeSVG value={feedUrl} size={160} bgColor="#ffffff" fgColor="#1a1033" level="M" />
                  </div>
                  <p className={styles.urlText}>{feedUrl}</p>
                  <div className={styles.linkActions}>
                    <CopyButton text={feedUrl} />
                    <a className={styles.openBtn} href={feedUrl} target="_blank" rel="noreferrer">
                      Open Feed ↗
                    </a>
                  </div>
                </>
              ) : (
                <div className={styles.qrPlaceholder} />
              )}
            </div>
          )}

          {/* ── Step 2: Attendees ── */}
          {step === 1 && (
            <div className={styles.stepBody}>
              <div className={styles.stepIcon}>📱</div>
              <h1 className={styles.stepTitle}>Attendees Submit Requests</h1>
              <p className={styles.stepDesc}>
                Attendees scan the QR code on the feed screen with their phone — <strong>no app to download</strong>.
                They can request dances and optionally tip with Beats to boost their request in the queue.
              </p>
              {requestUrl ? (
                <>
                  <div className={styles.qrWrap}>
                    <QRCodeSVG value={requestUrl} size={160} bgColor="#ffffff" fgColor="#1a1033" level="M" />
                  </div>
                  <p className={styles.urlText}>{requestUrl}</p>
                  <div className={styles.linkActions}>
                    <CopyButton text={requestUrl} />
                    <a className={styles.openBtn} href={requestUrl} target="_blank" rel="noreferrer">
                      Preview ↗
                    </a>
                  </div>
                  <p className={styles.tip}>
                    💡 You can also share this link directly — text it to a friend or post it before the event.
                  </p>
                </>
              ) : (
                <div className={styles.qrPlaceholder} />
              )}
            </div>
          )}

          {/* ── Step 3: Controller ── */}
          {step === 2 && (
            <div className={styles.stepBody}>
              <div className={styles.stepIcon}>🎛️</div>
              <h1 className={styles.stepTitle}>Your Controller</h1>
              <p className={styles.stepDesc}>
                The controller is <strong>just for you</strong> — attendees never see it.
              </p>
              <ul className={styles.controllerHints}>
                <li>
                  <span className={styles.hintIcon}>📋</span>
                  <span><strong>Pending</strong> — new requests waiting for your approval</span>
                </li>
                <li>
                  <span className={styles.hintIcon}>▶️</span>
                  <span><strong>Queue</strong> — approved dances in the order you'll play them</span>
                </li>
                <li>
                  <span className={styles.hintIcon}>✓</span>
                  <span>Tap <strong>Play</strong> when a dance starts, <strong>Played</strong> when it's done</span>
                </li>
                <li>
                  <span className={styles.hintIcon}>⏭️</span>
                  <span>Skip requests you don't want without explaining why</span>
                </li>
              </ul>
            </div>
          )}

          {/* ── Navigation ── */}
          <div className={styles.navRow}>
            {step > 0 ? (
              <button className={styles.backBtn} onClick={back}>← Back</button>
            ) : (
              <span />
            )}
            <button className={styles.nextBtn} onClick={next}>
              {step === STEPS.length - 1 ? 'Go to Controller →' : 'Next →'}
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
