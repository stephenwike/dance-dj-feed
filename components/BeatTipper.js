import { useState, useEffect } from 'react';
import styles from './BeatTipper.module.css';

const PRESETS = [1, 5, 10, 25];

export default function BeatTipper({ balance, onPendingChange, resetSignal }) {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setPending(0);
    onPendingChange(0);
  }, [resetSignal]);

  function choose(n) {
    const next = pending === n ? 0 : Math.min(n, balance);
    setPending(next);
    onPendingChange(next);
  }

  if (balance === 0) {
    return (
      <p className={styles.empty}>No Beats in your balance — buy some above.</p>
    );
  }

  const visiblePresets = PRESETS.filter(p => p <= balance);
  const showAll = balance > 0 && !PRESETS.includes(balance);

  return (
    <div className={styles.chips}>
      {visiblePresets.map(p => (
        <button
          key={p}
          type="button"
          className={`${styles.chip} ${pending === p ? styles.chipActive : ''}`}
          onClick={() => choose(p)}
        >
          {p}
        </button>
      ))}
      {showAll && (
        <button
          type="button"
          className={`${styles.chip} ${pending === balance ? styles.chipActive : ''}`}
          onClick={() => choose(balance)}
        >
          All ({balance})
        </button>
      )}
    </div>
  );
}
