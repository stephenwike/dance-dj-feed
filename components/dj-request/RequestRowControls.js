import styles from '../../pages/dj-request/dj-request.module.css';
import BeatBooster from '../BeatBooster';
import { Plus, Check } from 'lucide-react';
import { beatsFromCents } from '../../lib/beats/constants';

/**
 * Right-hand controls on a request row: one pill, with — on your own
 * request — the Beats coin underneath.
 *   "+ 1"  someone else's request: tap to add yours (the number is how many
 *          people want it)
 *   "✓ 2"  you're in: tap to withdraw (asks first)
 *   🪙 20  your tip — or "Tip" before you've tipped; opens the booster (or
 *          Get Beats with an empty balance)
 * The block has a fixed size — the coin's space is kept even on rows without
 * it — so every row lines up and the text beside it ends in one place.
 */
export function RequestRowActions({
  myRequest, count, canTip, beatBalance, boosterOpen,
  onToggleBooster, onGetBeats, onAdd, onRemove, addDisabled, addTitle,
}) {
  if (!myRequest) {
    return (
      <div className={styles.tabRowActions}>
        <button
          className={`${styles.requestPill} ${styles.requestPillJoin}`}
          onClick={onAdd}
          disabled={addDisabled}
          title={addTitle}
          aria-label={`${addTitle} (${count} requested)`}
        >
          <Plus size={14} strokeWidth={3} aria-hidden="true" /><span>{count}</span>
        </button>
        <span className={styles.tipSlot} aria-hidden="true" />
      </div>
    );
  }

  const myBeats = beatsFromCents(myRequest.tipCents);
  const hasTip = myBeats > 0;
  return (
    <div className={styles.tabRowActions}>
      <button
        className={`${styles.requestPill} ${styles.requestPillMine}`}
        onClick={onRemove}
        title="You requested this — tap to withdraw"
        aria-label={`You requested this (${count} requested). Withdraw your request`}
      >
        <Check size={14} strokeWidth={3} aria-hidden="true" /><span>{count}</span>
      </button>
      {!canTip && <span className={styles.tipSlot} aria-hidden="true" />}
      {canTip && (
        <button
          className={`${styles.tipCoin} ${hasTip ? styles.tipCoinTipped : ''} ${boosterOpen ? styles.tipCoinOpen : ''}`}
          onClick={beatBalance === 0 ? onGetBeats : onToggleBooster}
          title={beatBalance === 0 ? 'Get Beats' : 'Tip with Beats to boost your request'}
        >
          <img src="/beats/coin_front.png" alt="" aria-hidden="true" />
          <span>{hasTip ? myBeats : 'Tip'}</span>
        </button>
      )}
    </div>
  );
}

/** Beat booster and remove-confirmation panels that open under a row the attendee owns. */
export function RequestRowPanels({
  myRequest, isLast, lastLabel, boosterOpen, confirmingRemove, beatBalance,
  onTip, onCloseBooster, onCancelRemove, onConfirmRemove,
}) {
  if (!myRequest) return null;
  const spentBeats = beatsFromCents(myRequest.tipCents);
  return (
    <>
      {boosterOpen && (
        <BeatBooster balance={beatBalance} onTip={onTip} onClose={onCloseBooster} />
      )}
      {confirmingRemove && (
        <div className={styles.removeWarning}>
          {isLast && <p className={styles.removeWarningText}>You are the last person requesting this {lastLabel} — removing it will remove it from the list for everyone.</p>}
          {spentBeats > 0 && <p className={styles.removeWarningText}>You have spent {spentBeats} Beats on this request that will not be refunded.</p>}
          <div className={styles.removeWarningActions}>
            <button className={styles.removeWarningCancel} onClick={onCancelRemove}>Keep request</button>
            <button className={styles.removeWarningConfirm} onClick={onConfirmRemove}>Remove</button>
          </div>
        </div>
      )}
    </>
  );
}

export function SuppressedOverlay() {
  return (
    <div className={styles.suppressedOverlay}>
      <div className={styles.suppressedCard}>
        <span className={styles.suppressedIcon}>🎵</span>
        <h2 className={styles.suppressedTitle}>Your requests have been paused</h2>
        <p className={styles.suppressedMsg}>
          The DJ has temporarily disabled your account. If you&apos;re still here, let the DJ know and they can re-enable you.
        </p>
      </div>
    </div>
  );
}
