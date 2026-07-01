import { URGENT_TEMPLATES, QUEUE_TEMPLATES, URGENT_DURATIONS, QUEUE_DURATIONS } from '../../lib/messages/templates';
import styles from '../../pages/dj-controller/dj-controller.module.css';

export default function MessagePanel({
  activeSession,
  msgTab, setMsgTab,
  msgText, setMsgText,
  msgDuration, setMsgDuration,
  activeMsg, clearMessage, postMessage, addQueueMessage,
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.msgTabs}>
          <button
            className={`${styles.msgTab} ${msgTab === 'urgent' ? styles.msgTabActive : ''}`}
            onClick={() => setMsgTab('urgent')}
          >
            📢 Urgent
          </button>
          <button
            className={`${styles.msgTab} ${msgTab === 'queue' ? styles.msgTabActive : ''}`}
            onClick={() => setMsgTab('queue')}
          >
            💬 In-queue
          </button>
        </div>
      </div>

      <div className={styles.panelBody}>
        {!activeSession ? (
          <p className={styles.empty}>Start a session to post messages.</p>
        ) : (
          <>
            {msgTab === 'urgent' && activeMsg && (
              <div className={styles.msgActive}>
                <span className={styles.msgActiveText}>{activeMsg.text}</span>
                <button className={styles.msgClearBtn} onClick={clearMessage}>Clear</button>
              </div>
            )}

            <div className={styles.msgTemplates}>
              {(msgTab === 'urgent' ? URGENT_TEMPLATES : QUEUE_TEMPLATES).map(t => (
                <button
                  key={t}
                  className={`${styles.msgTemplate} ${msgText === t ? styles.msgTemplateActive : ''}`}
                  onClick={() => setMsgText(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            <textarea
              className={styles.msgInput}
              placeholder={msgTab === 'urgent' ? 'Or type a custom urgent message…' : 'Or type a custom announcement…'}
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              rows={3}
              maxLength={120}
            />

            <div className={styles.msgFooter}>
              <div className={styles.msgDurations}>
                {(msgTab === 'urgent' ? URGENT_DURATIONS : QUEUE_DURATIONS).map(d => (
                  <button
                    key={d.label}
                    className={`${styles.msgDuration} ${msgDuration === d.seconds ? styles.msgDurationActive : ''}`}
                    onClick={() => setMsgDuration(d.seconds)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <button
                className={styles.msgPostBtn}
                onClick={msgTab === 'urgent' ? postMessage : addQueueMessage}
                disabled={!msgText.trim()}
              >
                {msgTab === 'urgent' ? 'Post' : 'Add to Queue'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
