import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import styles from './dj-profile.module.css';

const fetcher = url => fetch(url).then(r => r.json());

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function txLabel(type) {
  switch (type) {
    case 'beat_tip':    return 'Beat tip';
    case 'direct_tip':  return 'Direct tip';
    case 'withdrawal':  return 'Withdrawal';
    case 'session_payment': return 'Session payment';
    default: return type;
  }
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function DJProfilePage() {
  const router = useRouter();
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [connectNotice, setConnectNotice] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const [savingLinks, setSavingLinks] = useState(false);

  const { data: wallet, mutate: mutateWallet } = useSWR('/api/dj/wallet', fetcher, { refreshInterval: 30000 });
  const { data: connectStatus, mutate: mutateConnect } = useSWR('/api/dj/connect/status', fetcher, { refreshInterval: 60000 });
  const { data: profileData, mutate: mutateProfile } = useSWR('/api/dj/profile', fetcher);

  const balance = wallet?.balance ?? 0;
  const stripeAvailable = wallet?.stripeAvailable ?? 0;
  const stripePending = wallet?.stripePending ?? 0;
  const withdrawable = Math.min(balance, stripeAvailable);
  const transactions = wallet?.transactions ?? [];
  const payoutsEnabled = connectStatus?.payoutsEnabled ?? false;
  const detailsSubmitted = connectStatus?.detailsSubmitted ?? false;
  const paymentLinks = profileData?.paymentLinks ?? [];

  // Handle returns from Stripe Connect onboarding
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connect_success')) {
      setConnectNotice('Payout account connected! It may take a moment to verify.');
      mutateConnect();
      router.replace('/dj-profile', undefined, { shallow: true });
    }
    if (params.get('connect_refresh')) {
      setConnectNotice('Please complete your payout account setup.');
      router.replace('/dj-profile', undefined, { shallow: true });
    }
  }, []);

  async function startOnboarding() {
    setOnboarding(true);
    try {
      const res = await fetch('/api/dj/connect/onboard', { method: 'POST' });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setOnboarding(false);
    }
  }

  async function addPaymentLink() {
    setLinkError('');
    if (!linkLabel.trim()) { setLinkError('Label is required'); return; }
    if (!linkUrl.trim()) { setLinkError('URL is required'); return; }
    try { new URL(linkUrl.trim()); } catch { setLinkError('Enter a valid URL (include https://)'); return; }
    setSavingLinks(true);
    try {
      const next = [...paymentLinks, { label: linkLabel.trim(), url: linkUrl.trim() }];
      const res = await fetch('/api/dj/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentLinks: next }) });
      const body = await res.json();
      if (!res.ok) { setLinkError(body.error || 'Failed to save'); return; }
      mutateProfile();
      setLinkLabel(''); setLinkUrl('');
    } finally { setSavingLinks(false); }
  }

  async function removePaymentLink(idx) {
    setSavingLinks(true);
    try {
      const next = paymentLinks.filter((_, i) => i !== idx);
      await fetch('/api/dj/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentLinks: next }) });
      mutateProfile();
    } finally { setSavingLinks(false); }
  }

  async function handleWithdraw() {
    const cents = Math.round(parseFloat(withdrawAmount) * 100);
    if (!cents || cents < 100) { setWithdrawError('Minimum withdrawal is $1.00'); return; }
    if (cents > balance) { setWithdrawError('Amount exceeds your balance'); return; }
    setWithdrawing(true);
    setWithdrawError('');
    try {
      const res = await fetch('/api/dj/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: cents }),
      });
      const body = await res.json();
      if (!res.ok) { setWithdrawError(body.error || 'Withdrawal failed'); return; }
      setWithdrawSuccess(true);
      setWithdrawAmount('');
      mutateWallet();
      setTimeout(() => setWithdrawSuccess(false), 5000);
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <>
      <Head><title>DJ Profile</title></Head>
      <div className={styles.page}>
        <div className={styles.header}>
          <Link href="/dj-controller" className={styles.back}>← Controller</Link>
          <h1 className={styles.title}>Wallet & Payouts</h1>
        </div>

        {/* ── Balance ── */}
        <div className={styles.card}>
          <p className={styles.balanceLabel}>Total earnings</p>
          <p className={styles.balanceAmount}>{formatCents(balance)}</p>
          {payoutsEnabled && (stripeAvailable > 0 || stripePending > 0) && (
            <div className={styles.balanceBreakdown}>
              <span className={styles.balanceDetail}>Available to withdraw: {formatCents(withdrawable)}</span>
              {stripePending > 0 && (
                <span className={styles.balancePending}>Pending settlement: {formatCents(stripePending)}</span>
              )}
            </div>
          )}
        </div>

        {/* ── Connect notice ── */}
        {connectNotice && (
          <div className={styles.notice}>{connectNotice}</div>
        )}

        {/* ── Payout setup ── */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>Payout account</h2>
          {payoutsEnabled ? (
            <p className={styles.connectedMsg}>✓ Connected — payouts enabled</p>
          ) : detailsSubmitted ? (
            <>
              <p className={styles.pendingMsg}>Account submitted — Stripe is verifying your details. This can take 1–2 business days.</p>
              <button className={styles.btn} onClick={startOnboarding} disabled={onboarding}>
                {onboarding ? 'Redirecting…' : 'Continue setup'}
              </button>
            </>
          ) : (
            <>
              <p className={styles.setupMsg}>Connect a bank account to withdraw your earnings.</p>
              <button className={styles.btn} onClick={startOnboarding} disabled={onboarding}>
                {onboarding ? 'Redirecting…' : 'Set up payouts'}
              </button>
            </>
          )}
        </div>

        {/* ── Payment Links ── */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>Payment links</h2>
          <p className={styles.setupMsg}>Add up to 3 links (Venmo, PayPal, CashApp, etc.) — attendees can scan them as QR codes on the feed screen to tip you directly.</p>

          {paymentLinks.length > 0 && (
            <ul className={styles.linkList}>
              {paymentLinks.map((link, idx) => (
                <li key={idx} className={styles.linkRow}>
                  <span className={styles.linkLabel}>{link.label}</span>
                  <span className={styles.linkUrl}>{link.url}</span>
                  <button className={styles.linkRemove} onClick={() => removePaymentLink(idx)} disabled={savingLinks}>✕</button>
                </li>
              ))}
            </ul>
          )}

          {paymentLinks.length < 3 && (
            <div className={styles.linkForm}>
              <input
                className={styles.linkInput}
                placeholder="Label (e.g. Venmo)"
                value={linkLabel}
                onChange={e => { setLinkLabel(e.target.value); setLinkError(''); }}
                disabled={savingLinks}
              />
              <input
                className={`${styles.linkInput} ${styles.linkInputUrl}`}
                placeholder="https://venmo.com/u/your-username"
                value={linkUrl}
                onChange={e => { setLinkUrl(e.target.value); setLinkError(''); }}
                disabled={savingLinks}
              />
              <button className={styles.btn} onClick={addPaymentLink} disabled={savingLinks || !linkLabel || !linkUrl}>
                {savingLinks ? 'Saving…' : 'Add'}
              </button>
            </div>
          )}
          {linkError && <p className={styles.withdrawError}>{linkError}</p>}
        </div>

        {/* ── Withdraw ── */}
        {payoutsEnabled && (
          <div className={styles.card}>
            <h2 className={styles.sectionTitle}>Withdraw</h2>
            {withdrawable < 100 ? (
              <p className={styles.withdrawHint}>
                {balance >= 100 && stripePending > 0
                  ? `You have ${formatCents(balance)} in earnings, but funds are still settling with Stripe. Payments typically take 2–3 business days to become available.`
                  : `Minimum withdrawal is $1.00. Your current available balance is ${formatCents(withdrawable)}.`}
              </p>
            ) : (
              <>
                <p className={styles.withdrawHint}>Min $1.00 · Max {formatCents(withdrawable)}</p>
                <div className={styles.withdrawRow}>
                  <span className={styles.withdrawDollar}>$</span>
                  <input
                    className={styles.withdrawInput}
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChange={e => { setWithdrawAmount(e.target.value); setWithdrawError(''); }}
                  />
                  <button
                    className={styles.withdrawAllBtn}
                    onClick={() => { setWithdrawAmount((withdrawable / 100).toFixed(2)); setWithdrawError(''); }}
                  >
                    Max
                  </button>
                  <button
                    className={styles.withdrawBtn}
                    onClick={handleWithdraw}
                    disabled={withdrawing || !withdrawAmount}
                  >
                    {withdrawing ? 'Processing…' : 'Withdraw'}
                  </button>
                </div>
              </>
            )}
            {withdrawError && <p className={styles.withdrawError}>{withdrawError}</p>}
            {withdrawSuccess && <p className={styles.withdrawSuccess}>Transfer initiated — funds arrive in 1–3 business days.</p>}
          </div>
        )}

        {/* ── Transaction history ── */}
        {transactions.length > 0 && (
          <div className={styles.card}>
            <h2 className={styles.sectionTitle}>Recent transactions</h2>
            <ul className={styles.txList}>
              {transactions.map(t => (
                <li key={t._id} className={styles.txRow}>
                  <span className={styles.txType}>{txLabel(t.type)}</span>
                  <span className={styles.txAge}>{timeAgo(t.createdAt)}</span>
                  <span className={`${styles.txAmount} ${t.amountCents < 0 ? styles.txDebit : styles.txCredit}`}>
                    {t.amountCents < 0 ? '−' : '+'}{formatCents(Math.abs(t.amountCents))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
