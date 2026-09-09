import { useState } from 'react';
import useSWR from 'swr';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { EXTENSION_PRICE_CENTS_PER_HOUR } from '../../lib/dj/sessionPricing';

const fetcher = url => fetch(url).then(r => r.json());
const HOUR_OPTIONS = [1, 2, 3, 4, 5, 6];

function walletPrice(hours) {
  const gross = hours * EXTENSION_PRICE_CENTS_PER_HOUR;
  const stripeFee = Math.round(gross * 0.029) + 30;
  return gross - stripeFee;
}

export default function ExtendSessionModal({ sessionId, onClose, onExtended }) {
  const [hours, setHours] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: walletData } = useSWR('/api/dj/wallet', fetcher, { revalidateOnFocus: false });
  const walletBalance = walletData?.balance ?? null;

  const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
  const stripePriceCents = hours * EXTENSION_PRICE_CENTS_PER_HOUR;
  const walletPriceCents = walletPrice(hours);
  const walletSavings = stripePriceCents - walletPriceCents;
  const canPayFromWallet = walletBalance !== null && walletBalance >= walletPriceCents;

  async function handleExtend(payFromWallet = false) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/dj/sessions/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, hours, payFromWallet }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.extended) {
        onExtended?.();
        onClose();
      } else {
        setError(data.error || 'Extension failed');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.extendOverlay} onClick={onClose}>
      <div className={styles.extendModal} onClick={e => e.stopPropagation()}>
        <h3 className={styles.extendTitle}>Extend Session</h3>
        <div className={styles.extendOptions}>
          {HOUR_OPTIONS.map(h => (
            <button
              key={h}
              className={`${styles.extendOption} ${hours === h ? styles.extendOptionActive : ''}`}
              onClick={() => setHours(h)}
            >
              {h} hr{h > 1 ? 's' : ''}
            </button>
          ))}
        </div>

        {error && <p className={styles.extendError}>{error}</p>}

        <div className={styles.extendActions}>
          <button className={styles.extendCancel} onClick={onClose} disabled={loading}>Cancel</button>

          {paymentsEnabled && (
            <button
              className={styles.extendWallet}
              onClick={() => handleExtend(true)}
              disabled={loading || !canPayFromWallet}
              title={
                walletBalance === null ? 'Loading balance…'
                : !canPayFromWallet ? `Need $${(walletPriceCents / 100).toFixed(2)}, wallet has $${(walletBalance / 100).toFixed(2)}`
                : `Save $${(walletSavings / 100).toFixed(2)} vs. Stripe`
              }
            >
              {loading ? '…' : `Wallet $${(walletPriceCents / 100).toFixed(2)}`}
            </button>
          )}

          <button
            className={styles.extendConfirm}
            onClick={() => handleExtend(false)}
            disabled={loading}
          >
            {loading ? 'Processing…' : paymentsEnabled ? `Stripe $${(stripePriceCents / 100).toFixed(2)}` : 'Extend'}
          </button>
        </div>
      </div>
    </div>
  );
}
