import styles from '../../pages/dj-controller/dj-controller.module.css';
import CustomEditModal from './CustomEditModal';
import ExtendSessionModal from './ExtendSessionModal';

/**
 * Dialogs and toasts shared by both controller layouts: editing a request,
 * extending the session, and tip notifications.
 */
export default function ControllerOverlays({ ctl }) {
  const toast = ctl.toastQueue[0];
  return (
    <>
      {ctl.editingGroup && (
        <CustomEditModal
          group={ctl.editingGroup}
          onClose={() => ctl.setEditingGroup(null)}
          onSave={ctl.saveGroupEdit}
        />
      )}

      {ctl.showExtendModal && ctl.liveSession && (
        <ExtendSessionModal
          sessionId={ctl.liveSession._id}
          onClose={() => ctl.setShowExtendModal(false)}
          onExtended={() => ctl.mutateSessions()}
        />
      )}

      {toast && (
        <div className={styles.tipToast}>
          <span className={styles.tipToastIcon}>💰</span>
          <div className={styles.tipToastContent}>
            <span className={styles.tipToastTitle}>Direct Tip Received!</span>
            <span className={styles.tipToastBody}>
              {toast.senderName || toast.senderEmail || 'Someone'} sent ${(toast.amountCents / 100).toFixed(2)}
            </span>
          </div>
          <button className={styles.tipToastSeen} onClick={() => ctl.markSeenFromToast(toast._id)} title="Mark as seen">
            ✓
          </button>
        </div>
      )}
    </>
  );
}
