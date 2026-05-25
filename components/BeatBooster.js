import { useState } from 'react';
import styles from './BeatBooster.module.css';

const PRESETS = [5, 10, 25, 50];

export default function BeatBooster({ balance, onTip, onClose }) {
  const [selected, setSelected] = useState(null);
  const [confirming, setConfirming] = useState(false);

  async function confirm() {
    if (!selected || confirming) return;
    setConfirming(true);
    try {
      await onTip(selected);
    } finally {
      setConfirming(false);
    }
  }

  const visiblePresets = PRESETS.filter(p => p <= balance);
  const showAll = balance > 0 && !PRESETS.includes(balance);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.title}>Boost request</span>
        <span className={styles.balance}>{balance} Beat{balance !== 1 ? 's' : ''} available</span>
      </div>
      <div className={styles.chips}>
        {visiblePresets.map(p => (
          <button
            key={p}
            type="button"
            className={`${styles.chip} ${selected === p ? styles.chipActive : ''}`}
            onClick={() => setSelected(selected === p ? null : p)}
          >
            +{p}
          </button>
        ))}
        {showAll && (
          <button
            type="button"
            className={`${styles.chip} ${selected === balance ? styles.chipActive : ''}`}
            onClick={() => setSelected(selected === balance ? null : balance)}
          >
            All ({balance})
          </button>
        )}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.confirmBtn}
          onClick={confirm}
          disabled={!selected || confirming}
        >
          {confirming ? 'Boosting…' : selected ? `Boost +${selected}` : 'Pick an amount'}
        </button>
      </div>
    </div>
  );
}
