import styles from '../../pages/dj-controller/dj-controller.module.css';

function timeAgo(dateStr) {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsPanel({ notifications, unreadCount, markRead, markAllRead }) {
  const unread = notifications.filter(n => !n.read);
  const read = notifications.filter(n => n.read);

  function label(n) {
    if (n.type === 'direct_tip') {
      const who = n.senderName || n.senderEmail || 'Someone';
      return `${who} sent a $${(n.amountCents / 100).toFixed(2)} tip`;
    }
    return n.type;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Notifications</span>
        {unreadCount > 0 && <span className={styles.colCount}>{unreadCount}</span>}
        {unreadCount > 0 && (
          <button className={styles.clearHistBtn} style={{ marginLeft: 'auto' }} onClick={markAllRead}>
            Mark all read
          </button>
        )}
      </div>

      <div className={styles.panelBody} style={{ padding: 0 }}>
        {notifications.length === 0 ? (
          <p className={styles.empty} style={{ padding: '12px 14px' }}>No notifications yet.</p>
        ) : (
          <>
            {unread.length > 0 && (
              <>
                <p className={styles.notifSection}>Unread</p>
                {unread.map(n => (
                  <div key={n._id} className={styles.notifRow}>
                    <span className={styles.notifDot} />
                    <span className={styles.notifText}>{label(n)}</span>
                    <span className={styles.notifAge}>{timeAgo(n.createdAt)}</span>
                    <button className={styles.notifMark} onClick={() => markRead(n._id)}>✓</button>
                  </div>
                ))}
              </>
            )}
            {read.length > 0 && (
              <>
                <p className={styles.notifSection} style={{ marginTop: 8 }}>Read</p>
                {read.map(n => (
                  <div key={n._id} className={`${styles.notifRow} ${styles.notifRowRead}`}>
                    <span className={styles.notifText}>{label(n)}</span>
                    <span className={styles.notifAge}>{timeAgo(n.createdAt)}</span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
