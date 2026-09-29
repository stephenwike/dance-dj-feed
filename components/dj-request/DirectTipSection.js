import { useState } from 'react';
import styles from '../../pages/dj-request/dj-request.module.css';
import { stripeFeeCents } from '../../lib/payments/fees';

const PRESETS = [100, 200, 500, 1000];
const MIN_TIP_CENTS = 100;

/** Card tip straight to the DJ via Stripe Checkout (processing fee added on top). */
export default function DirectTipSection({ djId, showBeatsNudge, isSignedIn, onGetBeats, onSignIn }) {
  const [choice, setChoice] = useState(null); // preset cents, or 'custom'
  const [custom, setCustom] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  const tipCents = choice === 'custom'
    ? Math.round(parseFloat(custom || '0') * 100)
    : choice;
  const valid = tipCents >= MIN_TIP_CENTS;
  const fee = valid ? stripeFeeCents(tipCents) : 0;

  async function send() {
    if (!valid || !djId) return;
    setRedirecting(true);
    try {
      const res = await fetch('/api/tips/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ djId, amountCents: tipCents, returnUrl: window.location.href }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setRedirecting(false);
    }
  }

  return (
    <div className={styles.directTipSection}>
      <p className={styles.directTipLabel}>Tip the DJ</p>
      {showBeatsNudge && (
        <div className={styles.directTipBeatsNudge}>
          <span>💡 Beats tip your specific request with no processing fee — 100% goes to the DJ and boosts your dance in the queue.</span>
          {isSignedIn
            ? <button className={styles.directTipBeatsLink} onClick={onGetBeats}>Get Beats →</button>
            : <button className={styles.directTipBeatsLink} onClick={onSignIn}>Sign in to use Beats →</button>
          }
        </div>
      )}
      <div className={styles.directTipPresets}>
        {PRESETS.map(c => (
          <button
            key={c}
            className={`${styles.directTipChip} ${choice === c ? styles.directTipChipActive : ''}`}
            onClick={() => { setChoice(c); setCustom(''); }}
          >
            ${c / 100}
          </button>
        ))}
        <button
          className={`${styles.directTipChip} ${choice === 'custom' ? styles.directTipChipActive : ''}`}
          onClick={() => setChoice('custom')}
        >
          Custom
        </button>
      </div>
      {choice === 'custom' && (
        <div className={styles.directTipCustomWrap}>
          <span className={styles.directTipDollar}>$</span>
          <input
            className={styles.directTipCustomInput}
            type="number" min="1" step="1" placeholder="0"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            autoFocus
          />
        </div>
      )}
      {valid && (
        <p className={styles.directTipFee}>
          You pay ${((tipCents + fee) / 100).toFixed(2)} · DJ receives ${(tipCents / 100).toFixed(2)}
        </p>
      )}
      <button className={styles.directTipBtn} onClick={send} disabled={!valid || redirecting}>
        {redirecting ? 'Redirecting…' : 'Tip the DJ'}
      </button>
    </div>
  );
}
