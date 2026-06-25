import { useState } from 'react';
import styles from '../../pages/dj-controller/dj-controller.module.css';

export default function SessionWarningBanner({ timeState, countdown, onExtend }) {
  const [dismissed, setDismissed] = useState(false);

  if (timeState === 'active' || timeState === 'expired') return null;
  if (timeState === 'warning' && dismissed) return null;

  const config = {
    warning: {
      className: styles.sessionWarning,
      message: `Session ends in ${countdown}`,
      dismissible: true,
    },
    urgent: {
      className: styles.sessionUrgent,
      message: `Session ends in ${countdown}!`,
      dismissible: false,
    },
    grace: {
      className: styles.sessionGrace,
      message: `Controls frozen — session expired. Auto-closes in ${countdown}`,
      dismissible: false,
    },
  };

  const c = config[timeState];
  if (!c) return null;

  return (
    <div className={c.className}>
      <span>{c.message}</span>
      <button className={styles.sessionWarningExtend} onClick={onExtend}>Extend</button>
      {c.dismissible && (
        <button className={styles.sessionWarningDismiss} onClick={() => setDismissed(true)}>
          &times;
        </button>
      )}
    </div>
  );
}
