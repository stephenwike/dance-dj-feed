import { useState } from 'react';
import styles from './BeatBooster.module.css';

const PRESETS = [1, 5, 10, 25, 50];

export default function BeatBooster({ balance, onTip, onClose }) {
  const [selected, setSelected] = useState(null);
  const [customRaw, setCustomRaw] = useState('');
  const [confirming, setConfirming] = useState(false);

  const customVal = customRaw !== '' ? (parseInt(customRaw, 10) || 0) : null;
  const amount = customVal !== null ? customVal : selected;
  const isValid = Number.isFinite(amount) && amount >= 1 && amount <= balance;

  async function confirm() {
    if (!isValid || confirming) return;
    setConfirming(true);
    try { await onTip(amount); } finally { setConfirming(false); }
  }

  const visiblePresets = PRESETS.filter(p => p <= balance);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.title}>Boost request</span>
        <span className={styles.balance}>{balance} Beat{balance !== 1 ? 's' : ''} available</span>
      </div>
      {visiblePresets.length > 0 && (
        <div className={styles.chips}>
          {visiblePresets.map(p => (
            <button
              key={p}
              type="button"
              className={`${styles.chip} ${selected === p && !customRaw ? styles.chipActive : ''}`}
              onClick={() => { setSelected(p); setCustomRaw(''); }}
            >
              +{p}
            </button>
          ))}
        </div>
      )}
      <div className={styles.customRow}>
        <input
          type="number"
          min="1"
          max={balance}
          value={customRaw}
          onChange={e => { setCustomRaw(e.target.value.replace(/\D/g, '')); setSelected(null); }}
          placeholder="Custom amount"
          className={`${styles.customInput} ${customRaw && isValid ? styles.customInputActive : ''}`}
        />
        <span className={styles.customUnit}>Beats</span>
      </div>
      <div className={styles.actions}>
        <span className={styles.noRefund}>Not refundable</span>
        <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
        <button
          type="button"
          className={styles.confirmBtn}
          onClick={confirm}
          disabled={!isValid || confirming}
        >
          {confirming ? 'Boosting…' : isValid ? `Boost +${amount}` : 'Pick an amount'}
        </button>
      </div>
    </div>
  );
}
