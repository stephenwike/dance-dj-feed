import { useState } from 'react';
import styles from './BeatBooster.module.css';

// Adjust presets and thresholds to taste
const PRESETS = [1, 5, 10, 25, 50];
const IMMEDIATE_MAX = 10;    // tips ≤ this send instantly (two taps total: open + tap)
const LARGE_THRESHOLD = 100; // above this, show "large tip" warning
const BALANCE_WARN_PCT = 0.5;

export default function BeatBooster({ balance, onTip, onClose }) {
  const [pending, setPending] = useState(null);
  const [tipping, setTipping] = useState(false);

  function needsConfirm(n) {
    return n > IMMEDIATE_MAX
      || n > LARGE_THRESHOLD
      || (balance > 0 && n / balance >= BALANCE_WARN_PCT);
  }

  function handlePreset(n) {
    if (needsConfirm(n)) {
      setPending(n);
    } else {
      doTip(n);
    }
  }

  async function doTip(n) {
    setTipping(true);
    try {
      await onTip(n);
    } finally {
      setTipping(false);
    }
  }

  if (balance === 0) {
    return (
      <div className={styles.strip}>
        <span className={styles.noBeats}>No Beats remaining</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
      </div>
    );
  }

  if (pending !== null) {
    const isLarge = pending > LARGE_THRESHOLD;
    const isMost = balance > 0 && pending / balance >= BALANCE_WARN_PCT;
    return (
      <div className={styles.strip}>
        {(isLarge || isMost) && (
          <span className={styles.warn}>
            {isLarge && isMost
              ? `Over 100 Beats · ${Math.round(pending / balance * 100)}% of balance`
              : isLarge
                ? 'Over 100 Beats'
                : `${Math.round(pending / balance * 100)}% of your balance`}
          </span>
        )}
        <span className={styles.confirmQ}>Send {pending} Beats?</span>
        <button
          className={styles.confirmYes}
          onClick={() => doTip(pending)}
          disabled={tipping}
        >
          {tipping ? '…' : 'Yes'}
        </button>
        <button className={styles.confirmNo} onClick={() => setPending(null)}>No</button>
      </div>
    );
  }

  return (
    <div className={styles.strip}>
      {PRESETS.map(n => (
        <button
          key={n}
          className={styles.chip}
          onClick={() => handlePreset(n)}
          disabled={n > balance || tipping}
        >
          +{n}
        </button>
      ))}
      <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
    </div>
  );
}
