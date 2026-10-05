import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import styles from './dj-start-session.module.css';
import AppCard from '../components/AppCard';
import ChargeSummary, { formatCents } from '../components/session/ChargeSummary';
import { fetcher } from '../lib/client/fetcher';
import { SESSION_DURATIONS_BY_MINUTES } from '../lib/dj/sessionPricing';
import { launchCharge } from '../lib/dj/sessionAddOns';
import { musicSource } from '../lib/dj/musicSources';
import { useGoLive, useWalletBalance, PAYMENTS_ENABLED } from '../lib/client/dj/useGoLive';

/**
 * Start session: what the event costs and how to pay, then start it.
 * Paying from the DanceFeed wallet is the cheaper option (no card fees);
 * paying by card goes through Stripe Checkout. Either way the DJ lands in
 * the controller with the event live. While payments are off it's free.
 *
 * ?id=<draft> is the event; ?from=plan returns to Plan the set.
 */
export default function StartSessionPage() {
  const router = useRouter();
  const { id, from } = router.query;
  const { data: event, error: loadError } = useSWR(id ? `/api/dj/sessions/${id}` : null, fetcher, { revalidateOnFocus: false });
  const walletBalance = useWalletBalance();
  const { goLive, busy, error } = useGoLive();
  const [method, setMethod] = useState(null); // 'wallet' | 'card'

  const back = from === 'plan' ? `/dj-plan?id=${id}` : `/start?event=${id}`;
  const backLabel = from === 'plan' ? '← Plan the set' : '← Your events';

  // Already started (e.g. after Back from the controller): it lives there now.
  useEffect(() => {
    if (event?.status === 'active') router.replace(`/dj-controller?session=${id}`);
  }, [event?.status]);

  const tier = event ? SESSION_DURATIONS_BY_MINUTES[event.durationMinutes] : null;
  const charge = tier ? launchCharge(tier, event.plugin) : null;
  const canWallet = !!charge && walletBalance !== null && walletBalance >= charge.walletPriceCents;

  // Suggest the wallet when it covers the cost, otherwise the card.
  useEffect(() => {
    if (method || !charge || walletBalance === null) return;
    setMethod(canWallet ? 'wallet' : 'card');
  }, [charge?.priceCents, walletBalance]);

  const start = () => goLive({ draftSessionId: id }, { wallet: PAYMENTS_ENABLED && method === 'wallet' });

  if (loadError || (event && event.status === 'closed')) {
    return <AppCard leftHref="/start" leftLabel="← Your events"><p className={styles.notice}>This event couldn’t be found.</p></AppCard>;
  }
  if (!event) return <AppCard leftHref={back} leftLabel={backLabel}><p className={styles.notice}>Loading…</p></AppCard>;

  return (
    <>
      <Head><title>Start Session</title></Head>
      <AppCard leftHref={back} leftLabel={backLabel}>
        <div className={styles.logo}>▶</div>
        <h1 className={styles.title}>Start session</h1>
        <p className={styles.sub}>
          Starting opens requests and the feed for <strong>{event.name}</strong>. The clock starts now and runs for {tier?.label ?? '—'}.
        </p>

        <div className={styles.body}>
          <div className={styles.eventLine}>
            <span>{event.name}</span>
            <span className={styles.eventMeta}>{tier?.label ?? 'No length set'} · {musicSource(event.plugin).label}</span>
          </div>

          {!tier ? (
            <p className={styles.error}>Choose how long the event runs first (Edit on Your events).</p>
          ) : PAYMENTS_ENABLED ? (
            <>
              <ChargeSummary charge={charge} />

              <span className={styles.label}>How would you like to pay?</span>
              <div className={styles.methods} role="radiogroup" aria-label="Payment method">
                <button
                  type="button"
                  role="radio"
                  aria-checked={method === 'wallet'}
                  className={`${styles.method} ${method === 'wallet' ? styles.methodActive : ''}`}
                  onClick={() => setMethod('wallet')}
                  disabled={!canWallet}
                >
                  <span className={styles.methodTop}>
                    <span className={styles.methodName}>DanceFeed wallet</span>
                    <span className={styles.methodPrice}>{formatCents(charge.walletPriceCents)}</span>
                  </span>
                  <span className={styles.methodDesc}>
                    {walletBalance === null ? 'Checking your balance…'
                      : canWallet ? <>No card fees — you save {formatCents(charge.priceCents - charge.walletPriceCents)}. Balance: {formatCents(walletBalance)}.</>
                      : <>Your balance ({formatCents(walletBalance)}) doesn’t cover this yet. Tips you earn go into your wallet.</>}
                  </span>
                  {canWallet && <span className={styles.badge}>Best price</span>}
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={method === 'card'}
                  className={`${styles.method} ${method === 'card' ? styles.methodActive : ''}`}
                  onClick={() => setMethod('card')}
                >
                  <span className={styles.methodTop}>
                    <span className={styles.methodName}>Card</span>
                    <span className={styles.methodPrice}>{formatCents(charge.priceCents)}</span>
                  </span>
                  <span className={styles.methodDesc}>Secure checkout with Stripe. You’ll come straight back to your controller.</span>
                </button>
              </div>

              {error && <p className={styles.error}>{error}</p>}

              <button type="button" className={styles.btn} onClick={start} disabled={!method || !!busy}>
                {busy === 'wallet' ? 'Starting…'
                  : busy === 'card' ? 'Opening checkout…'
                  : method === 'wallet' ? `Pay ${formatCents(charge.walletPriceCents)} from wallet & start`
                  : `Continue to card payment · ${formatCents(charge.priceCents)}`}
              </button>
            </>
          ) : (
            <>
              <p className={styles.free}>Free during testing — payments aren’t enabled yet.</p>
              {error && <p className={styles.error}>{error}</p>}
              <button type="button" className={styles.btn} onClick={start} disabled={!!busy}>
                {busy ? 'Starting…' : '▶ Start session'}
              </button>
            </>
          )}
        </div>
      </AppCard>
    </>
  );
}
