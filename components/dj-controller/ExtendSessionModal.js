import { useState } from 'react';
import styles from '../../pages/dj-controller/dj-controller.module.css';
import { EXTENSION_PRICE_CENTS_PER_HOUR } from '../../lib/dj/sessionPricing';

const HOUR_OPTIONS = [1, 2, 3, 4, 5, 6];

export default function ExtendSessionModal({ sessionId, onClose, onExtended }) {
  const [hours, setHours] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const priceCents = hours * EXTENSION_PRICE_CENTS_PER_HOUR;
  const priceDisplay = `$${(priceCents / 100).toFixed(2)}`;

  async function handleExtend() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/dj/sessions/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, hours }),
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
        <p className={styles.extendPrice}>{priceDisplay}</p>
        {error && <p className={styles.extendError}>{error}</p>}
        <div className={styles.extendActions}>
          <button className={styles.extendCancel} onClick={onClose}>Cancel</button>
          <button className={styles.extendConfirm} onClick={handleExtend} disabled={loading}>
            {loading ? 'Processing...' : 'Extend'}
          </button>
        </div>
      </div>
    </div>
  );
}
