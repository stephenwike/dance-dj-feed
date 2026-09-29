import styles from '../../pages/dj-request/dj-request.module.css';
import BeatBooster from '../BeatBooster';
import { beatsFromCents } from '../../lib/beats/constants';

/**
 * Right-hand controls on a request row: either "+" to add your request, or —
 * when you already requested it — the Beats boost button, the requester count
 * and "−" to withdraw.
 */
export function RequestRowActions({
  myRequest, count, canTip, beatBalance, boosterOpen,
  onToggleBooster, onGetBeats, onAdd, onRemove, addDisabled, addTitle,
}) {
  if (!myRequest) {
    return (
      <div className={styles.tabRowActions}>
        <span className={styles.reqCount}>{count}</span>
        <button className={styles.plusBtn} onClick={onAdd} disabled={addDisabled} title={addTitle}>+</button>
      </div>
    );
  }

  const myBeats = beatsFromCents(myRequest.tipCents);
  const hasTip = myBeats > 0;
  return (
    <div className={styles.tabRowActions}>
      {canTip && (
        <div className={`${styles.splitBoostWrap} ${hasTip ? styles.splitBoostWrapTipped : ''} ${boosterOpen ? styles.splitBoostWrapOpen : ''}`}>
          <button
            className={`${styles.splitBtnLeft} ${hasTip ? styles.splitBtnLeftTipped : ''}`}
            onClick={beatBalance === 0 ? onGetBeats : onToggleBooster}
            title={beatBalance === 0 ? 'Get Beats' : 'Boost options'}
          >
            <img src="/beats/coin_front.png" className={styles.coinIcon} alt="" aria-hidden="true" />{hasTip ? myBeats : ''}
          </button>
        </div>
      )}
      <span className={styles.reqCount}>{count}</span>
      <button className={styles.minusBtn} onClick={onRemove} title="Remove your request">−</button>
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
