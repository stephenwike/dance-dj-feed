import { useState, useMemo } from 'react';
import useSWR from 'swr';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import ws from '../../pages/dj-profile.module.css';

const fetcher = url => fetch(url).then(r => r.json());

function formatCents(cents) {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function txLabel(type) {
  switch (type) {
    case 'beat_tip':          return 'Beat tip';
    case 'direct_tip':        return 'Direct tip';
    case 'withdrawal':        return 'Withdrawal';
    case 'session_payment':   return 'Session payment';
    case 'dj_cut_correction': return 'Adjustment';
    default: return type;
  }
}

function shortDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function WalletPanel({ connectNotice }) {
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const [savingLinks, setSavingLinks] = useState(false);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(null);

  const { data: wallet, mutate: mutateWallet } = useSWR('/api/dj/wallet', fetcher, { refreshInterval: 30000 });
  const { data: connectStatus } = useSWR('/api/dj/connect/status', fetcher, { refreshInterval: 60000 });
  const { data: profileData, mutate: mutateProfile } = useSWR('/api/dj/profile', fetcher);
  const { data: stmtData } = useSWR('/api/dj/statements', fetcher, { revalidateOnFocus: false });

  const balance = wallet?.balance ?? 0;
  const stripeAvailable = wallet?.stripeAvailable ?? 0;
  const stripePending = wallet?.stripePending ?? 0;
  const withdrawable = Math.min(balance, stripeAvailable);
  const payoutsEnabled = connectStatus?.payoutsEnabled ?? false;
  const detailsSubmitted = connectStatus?.detailsSubmitted ?? false;
  const paymentLinks = profileData?.paymentLinks ?? [];

  // --- Statement data ---
  const allTxns = stmtData?.transactions ?? [];

  const months = useMemo(() => {
    const keys = [...new Set(allTxns.map(t => (t.createdAt ?? '').slice(0, 7)))].filter(Boolean).sort();
    return keys;
  }, [allTxns]);

  const effectiveIdx = selectedMonthIdx !== null ? selectedMonthIdx : months.length - 1;
  const selectedMonth = months[effectiveIdx] ?? null;

  const { openingBalance, monthTxns, closingBalance, totalEarned, totalWithdrawn } = useMemo(() => {
    if (!selectedMonth) return { openingBalance: 0, monthTxns: [], closingBalance: 0, totalEarned: 0, totalWithdrawn: 0 };

    const before = allTxns.filter(t => (t.createdAt ?? '').slice(0, 7) < selectedMonth);
    const during = allTxns.filter(t => (t.createdAt ?? '').slice(0, 7) === selectedMonth);

    const openingBalance = before.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);
    let running = openingBalance;
    const monthTxns = during.map(t => {
      running += (t.amountCents ?? 0);
      return { ...t, runningBalance: running };
    });

    const totalEarned = during.filter(t => (t.amountCents ?? 0) > 0).reduce((sum, t) => sum + t.amountCents, 0);
    const totalWithdrawn = Math.abs(during.filter(t => (t.amountCents ?? 0) < 0).reduce((sum, t) => sum + t.amountCents, 0));

    return { openingBalance, monthTxns, closingBalance: running, totalEarned, totalWithdrawn };
  }, [allTxns, selectedMonth]);

  const net = closingBalance - openingBalance;

  // --- Handlers ---
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
      const res = await fetch('/api/dj/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentLinks: next }),
      });
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
      await fetch('/api/dj/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentLinks: next }),
      });
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: cents }),
      });
      const body = await res.json();
      if (!res.ok) { setWithdrawError(body.error || 'Withdrawal failed'); return; }
      setWithdrawSuccess(true);
      setWithdrawAmount('');
      mutateWallet();
      setTimeout(() => setWithdrawSuccess(false), 5000);
    } finally { setWithdrawing(false); }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Wallet &amp; Payouts</span>
      </div>
      <div className={`${styles.panelBody} ${styles.walletBody}`}>

        {connectNotice && (
          <div className={styles.walletNotice}>{connectNotice}</div>
        )}

        {/* Balance */}
        <div className={styles.walletCard}>
          <p className={ws.balanceLabel}>Total earnings</p>
          <p className={ws.balanceAmount}>{formatCents(balance)}</p>
          {payoutsEnabled && stripeAvailable > 0 && (
            <div className={ws.balanceBreakdown}>
              <span className={ws.balanceDetail}>Available to withdraw: {formatCents(withdrawable)}</span>
            </div>
          )}
        </div>

        {/* Payout account */}
        <div className={styles.walletCard}>
          <h2 className={ws.sectionTitle}>Payout account</h2>
          {payoutsEnabled ? (
            <p className={ws.connectedMsg}>✓ Connected — payouts enabled</p>
          ) : detailsSubmitted ? (
            <>
              <p className={ws.pendingMsg}>Account submitted — Stripe is verifying your details. This can take 1–2 business days.</p>
              <button className={ws.btn} onClick={startOnboarding} disabled={onboarding}>
                {onboarding ? 'Redirecting…' : 'Continue setup'}
              </button>
            </>
          ) : (
            <>
              <p className={ws.setupMsg}>Connect a bank account to withdraw your earnings.</p>
              <button className={ws.btn} onClick={startOnboarding} disabled={onboarding}>
                {onboarding ? 'Redirecting…' : 'Set up payouts'}
              </button>
            </>
          )}
        </div>

        {/* Payment links */}
        <div className={styles.walletCard}>
          <h2 className={ws.sectionTitle}>Payment links</h2>
          <p className={ws.setupMsg}>Add up to 3 links (Venmo, PayPal, CashApp, etc.) — attendees can scan them as QR codes on the feed screen.</p>
          {paymentLinks.length > 0 && (
            <ul className={ws.linkList}>
              {paymentLinks.map((link, idx) => (
                <li key={idx} className={ws.linkRow}>
                  <span className={ws.linkLabel}>{link.label}</span>
                  <span className={ws.linkUrl}>{link.url}</span>
                  <button className={ws.linkRemove} onClick={() => removePaymentLink(idx)} disabled={savingLinks}>✕</button>
                </li>
              ))}
            </ul>
          )}
          {paymentLinks.length < 3 && (
            <div className={ws.linkForm}>
              <input
                className={ws.linkInput}
                placeholder="Label (e.g. Venmo)"
                value={linkLabel}
                onChange={e => { setLinkLabel(e.target.value); setLinkError(''); }}
                disabled={savingLinks}
              />
              <input
                className={`${ws.linkInput} ${ws.linkInputUrl}`}
                placeholder="https://venmo.com/u/username"
                value={linkUrl}
                onChange={e => { setLinkUrl(e.target.value); setLinkError(''); }}
                disabled={savingLinks}
              />
              <button className={ws.btn} onClick={addPaymentLink} disabled={savingLinks || !linkLabel || !linkUrl}>
                {savingLinks ? 'Saving…' : 'Add'}
              </button>
            </div>
          )}
          {linkError && <p className={ws.withdrawError}>{linkError}</p>}
        </div>

        {/* Withdraw */}
        {payoutsEnabled && (
          <div className={styles.walletCard}>
            <h2 className={ws.sectionTitle}>Withdraw</h2>
            {withdrawable < 100 ? (
              <p className={ws.withdrawHint}>
                {balance >= 100 && stripePending > 0
                  ? `You have ${formatCents(balance)} in earnings, but funds are still settling with Stripe. Payments typically take 2–3 business days to become available.`
                  : `Minimum withdrawal is $1.00. Your current available balance is ${formatCents(withdrawable)}.`}
              </p>
            ) : (
              <>
                <p className={ws.withdrawHint}>Min $1.00 · Max {formatCents(withdrawable)}</p>
                <div className={ws.withdrawRow}>
                  <span className={ws.withdrawDollar}>$</span>
                  <input
                    className={ws.withdrawInput}
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChange={e => { setWithdrawAmount(e.target.value); setWithdrawError(''); }}
                  />
                  <button className={ws.withdrawAllBtn} onClick={() => { setWithdrawAmount((withdrawable / 100).toFixed(2)); setWithdrawError(''); }}>
                    Max
                  </button>
                  <button className={ws.withdrawBtn} onClick={handleWithdraw} disabled={withdrawing || !withdrawAmount}>
                    {withdrawing ? 'Processing…' : 'Withdraw'}
                  </button>
                </div>
              </>
            )}
            {withdrawError && <p className={ws.withdrawError}>{withdrawError}</p>}
            {withdrawSuccess && <p className={ws.withdrawSuccess}>Transfer initiated — funds arrive in 1–3 business days.</p>}
          </div>
        )}

        {/* Monthly statement */}
        {months.length > 0 && (
          <div className={styles.walletCard}>
            <div className={styles.stmtMonthNav}>
              <button
                className={styles.stmtNavBtn}
                onClick={() => setSelectedMonthIdx(Math.max(0, effectiveIdx - 1))}
                disabled={effectiveIdx === 0}
                aria-label="Previous month"
              >‹</button>
              <span className={styles.stmtMonthLabel}>{selectedMonth ? monthLabel(selectedMonth) : '—'}</span>
              <button
                className={styles.stmtNavBtn}
                onClick={() => setSelectedMonthIdx(Math.min(months.length - 1, effectiveIdx + 1))}
                disabled={effectiveIdx === months.length - 1}
                aria-label="Next month"
              >›</button>
            </div>

            {/* Summary row */}
            <div className={styles.stmtSummary}>
              <div className={styles.stmtSummaryItem}>
                <span className={styles.stmtSummaryLabel}>Earned</span>
                <span className={`${styles.stmtSummaryValue} ${styles.stmtCredit}`}>+{formatCents(totalEarned)}</span>
              </div>
              <div className={styles.stmtSummaryDivider} />
              <div className={styles.stmtSummaryItem}>
                <span className={styles.stmtSummaryLabel}>Withdrawn</span>
                <span className={`${styles.stmtSummaryValue} ${styles.stmtDebit}`}>
                  {totalWithdrawn > 0 ? `−${formatCents(totalWithdrawn)}` : '—'}
                </span>
              </div>
              <div className={styles.stmtSummaryDivider} />
              <div className={styles.stmtSummaryItem}>
                <span className={styles.stmtSummaryLabel}>Net</span>
                <span className={`${styles.stmtSummaryValue} ${net >= 0 ? styles.stmtCredit : styles.stmtDebit}`}>
                  {net >= 0 ? '+' : '−'}{formatCents(net)}
                </span>
              </div>
            </div>

            {/* Ledger */}
            <div className={styles.stmtBalanceLine}>
              <span className={styles.stmtBalanceKind}>Opening balance</span>
              <span className={styles.stmtBalanceAmt}>{formatCents(openingBalance)}</span>
            </div>

            {monthTxns.length > 0 ? (
              <ul className={styles.stmtTxList}>
                {monthTxns.map(t => (
                  <li key={t._id} className={styles.stmtTxRow}>
                    <span className={styles.stmtTxDate}>{shortDate(t.createdAt)}</span>
                    <span className={styles.stmtTxType}>{txLabel(t.type)}</span>
                    <span className={`${styles.stmtTxAmount} ${t.amountCents < 0 ? styles.stmtDebit : styles.stmtCredit}`}>
                      {t.amountCents < 0 ? '−' : '+'}{formatCents(t.amountCents)}
                    </span>
                    <span className={styles.stmtRunning}>{formatCents(t.runningBalance)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={ws.setupMsg} style={{ margin: '12px 0 4px' }}>No activity this month.</p>
            )}

            <div className={`${styles.stmtBalanceLine} ${styles.stmtBalanceClose}`}>
              <span className={styles.stmtBalanceKind}>Closing balance</span>
              <span className={styles.stmtBalanceAmt}>{formatCents(closingBalance)}</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
