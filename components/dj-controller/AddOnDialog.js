import { useState } from 'react';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { addOnFor } from '../../lib/dj/sessionAddOns';
import { musicSource } from '../../lib/dj/musicSources';
import { useWalletBalance } from '../../lib/client/dj/useGoLive';
import { formatCents } from '../session/ChargeSummary';

/**
 * Buy a paid music source for the running event: a flat fee, by card
 * (Stripe Checkout, back to the controller) or from the wallet. Once bought,
 * the event switches to it, and can switch away and back freely.
 */
export default function AddOnDialog({ session, plugin, onClose, onAdded }) {
  const addOn = addOnFor(plugin);
  const walletBalance = useWalletBalance();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  if (!addOn) return null;
  const canWallet = walletBalance !== null && walletBalance >= addOn.walletPriceCents;

  async function buy(payFromWallet) {
    setBusy(payFromWallet ? 'wallet' : 'card');
    setError('');
    try {
      const res = await fetch('/api/dj/sessions/add-on', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session._id, plugin, payFromWallet, returnUrl: `${window.location.origin}/dj-controller`,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not add it.'); return; }
      if (data.url) { window.location.href = data.url; return; }
      onAdded();
      onClose();
    } catch {
      setError('Something went wrong. Check your connection.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.extendOverlay} onClick={onClose}>
      <div className={styles.extendModal} onClick={e => e.stopPropagation()}>
        <h3 className={styles.extendTitle}>Add {addOn.label} to this event</h3>
        <p className={styles.addOnDesc}>{musicSource(plugin).description}.</p>
        <p className={styles.extendPrice}>{formatCents(addOn.priceCents)}</p>
        <p className={styles.addOnDesc}>
          One fee for the rest of “{session.name}” — switch between {addOn.label} and the included sources as often as you like.
        </p>

        {error && <p className={styles.extendError}>{error}</p>}

        <div className={styles.extendActions}>
          <button className={styles.extendCancel} onClick={onClose} disabled={!!busy}>Cancel</button>
          <button
            className={styles.extendWallet}
            onClick={() => buy(true)}
            disabled={!!busy || !canWallet}
            title={walletBalance === null ? 'Loading balance…' : canWallet
              ? `Save ${formatCents(addOn.priceCents - addOn.walletPriceCents)} vs. card`
              : `Your wallet has ${formatCents(walletBalance)}`}
          >
            {busy === 'wallet' ? '…' : `Wallet ${formatCents(addOn.walletPriceCents)}`}
          </button>
          <button className={styles.extendConfirm} onClick={() => buy(false)} disabled={!!busy}>
            {busy === 'card' ? 'Opening…' : `Card ${formatCents(addOn.priceCents)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
