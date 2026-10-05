import styles from '../../pages/dj-controller/dj-controller.module.css';
import CustomEditModal from './CustomEditModal';
import ExtendSessionModal from './ExtendSessionModal';
import AddOnDialog from './AddOnDialog';
import GetReadyCard from './GetReadyCard';

/**
 * Dialogs and toasts shared by both controller layouts: editing a request,
 * extending the session, buying a music source, the "Get the room ready"
 * card after going live, and tip notifications.
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

      {ctl.addOnPlugin && ctl.liveSession && (
        <AddOnDialog
          session={ctl.liveSession}
          plugin={ctl.addOnPlugin}
          onClose={ctl.closeAddOn}
          onAdded={() => ctl.mutateSessions()}
        />
      )}

      {ctl.getReadySession && <GetReadyCard session={ctl.getReadySession} onDismiss={ctl.dismissGetReady} />}

      {ctl.launchNotice && (
        <div className={styles.launchNotice} role="status">
          <span>{ctl.launchNotice}</span>
          <button type="button" onClick={ctl.dismissLaunchNotice} aria-label="Dismiss">✕</button>
        </div>
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
