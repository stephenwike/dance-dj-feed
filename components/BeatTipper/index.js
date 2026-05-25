import { useState, useEffect } from 'react';
import styles from './BeatTipper.module.css';

// Adjust these to experiment with different preset step amounts
const PRESETS = [1, 5, 10, 25, 50];

const LARGE_TIP_BEATS = 100;   // ~$5 — triggers large-tip warning
const BALANCE_WARN_PCT = 0.5;  // warn when tip >= 50% of balance

export default function BeatTipper({
  balance,
  onTip,             // (beats: number) => Promise<void> — called on confirm (standalone mode)
  onPendingChange,   // (beats: number) => void — notifies parent of current pending (form mode)
  mode = 'standalone', // 'standalone' | 'form'
  resetSignal = 0,   // increment this from the parent to reset the tipper
}) {
  const [pending, setPending] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [tipping, setTipping] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setPending(0);
    setConfirming(false);
    setError('');
    onPendingChange?.(0);
  }, [resetSignal]);

  function add(n) {
    const next = Math.min(pending + n, balance);
    setPending(next);
    onPendingChange?.(next);
    setConfirming(false);
    setError('');
  }

  function clear() {
    setPending(0);
    onPendingChange?.(0);
    setConfirming(false);
    setError('');
  }

  async function handleConfirm() {
    if (pending === 0 || tipping) return;
    setTipping(true);
    setError('');
    try {
      await onTip(pending);
      clear();
    } catch (err) {
      setError(err.message || 'Tip failed — try again');
      setConfirming(false);
    } finally {
      setTipping(false);
    }
  }

  const pct = balance > 0 ? pending / balance : 0;
  const isAllBalance = pending > 0 && pending === balance;
  const isMostBalance = !isAllBalance && pct >= BALANCE_WARN_PCT;
  const isLarge = pending > LARGE_TIP_BEATS;

  if (balance === 0) {
    return (
      <div className={styles.tipper}>
        <p className={styles.noBeats}>No Beats remaining — buy more to tip</p>
      </div>
    );
  }

  return (
    <div className={styles.tipper}>
      <div className={styles.presets}>
        {PRESETS.map(n => (
          <button
            key={n}
            type="button"
            className={styles.presetBtn}
            onClick={() => add(n)}
            disabled={pending + n > balance}
          >
            +{n}
          </button>
        ))}
      </div>

      {pending > 0 && (
        <div className={styles.pendingSection}>
          <div className={styles.pendingRow}>
            <span className={styles.pendingAmount}>{pending} Beats</span>
            <button type="button" className={styles.clearLink} onClick={clear}>Clear</button>
          </div>

          {isAllBalance && (
            <p className={styles.warnAll}>This will use all your remaining Beats</p>
          )}
          {isMostBalance && (
            <p className={styles.warnMost}>
              This is {Math.round(pct * 100)}% of your balance
            </p>
          )}
          {isLarge && (
            <p className={styles.warnLarge}>Large tip — over 100 Beats</p>
          )}

          {mode === 'standalone' && (
            confirming ? (
              <div className={styles.confirmRow}>
                <p className={styles.confirmText}>Tip {pending} Beats to boost this request?</p>
                <div className={styles.confirmActions}>
                  <button type="button" className={styles.cancelBtn} onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.confirmBtn}
                    onClick={handleConfirm}
                    disabled={tipping}
                  >
                    {tipping ? 'Adding…' : 'Confirm'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={styles.tipBtn}
                onClick={() => setConfirming(true)}
              >
                Tip {pending} Beats
              </button>
            )
          )}

          {error && <p className={styles.tipError}>{error}</p>}
        </div>
      )}

      <p className={styles.balanceHint}>{balance} Beats remaining</p>
    </div>
  );
}
