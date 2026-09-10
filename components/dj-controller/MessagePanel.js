import { URGENT_TEMPLATES, QUEUE_TEMPLATES, URGENT_DURATIONS, QUEUE_DURATIONS } from '../../lib/messages/templates';
import styles from '../../pages/dj-controller/dj-controller.module.css';

const DM_DURATIONS = [
  { label: '15m', seconds: 900 },
  { label: '30m', seconds: 1800 },
  { label: '1h', seconds: 3600 },
  { label: 'No timeout', seconds: null },
];

export default function MessagePanel({
  activeSession,
  msgTab, setMsgTab,
  msgText, setMsgText,
  msgDuration, setMsgDuration,
  sendToAll, setSendToAll,
  activeMsg, clearMessage, postMessage, addQueueMessage,
  // Direct message props
  knownAttendees,
  dmRecipientId, setDmRecipientId,
  dmText, setDmText,
  dmDuration, setDmDuration,
  sendDirect,
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
          <button
            className={`${styles.msgTab} ${msgTab === 'direct' ? styles.msgTabActive : ''}`}
            onClick={() => setMsgTab('direct')}
          >
            📩 Direct
          </button>
        </div>
      </div>

      <div className={styles.panelBody}>
        {!activeSession ? (
          <p className={styles.empty}>Start a session to post messages.</p>
        ) : (
          <>
            {/* ── Urgent tab ── */}
            {msgTab === 'urgent' && (
              <>
                {activeMsg && (
                  <div className={styles.msgActive}>
                    <span className={styles.msgActiveText}>{activeMsg.text}</span>
                    <button className={styles.msgClearBtn} onClick={clearMessage}>Clear</button>
                  </div>
                )}

                <div className={styles.msgTemplates}>
                  {URGENT_TEMPLATES.map(t => (
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
                  placeholder="Or type a custom urgent message…"
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  rows={3}
                  maxLength={120}
                />

                <div className={styles.msgFooter}>
                  <div className={styles.msgDurations}>
                    {URGENT_DURATIONS.map(d => (
                      <button
                        key={d.label}
                        className={`${styles.msgDuration} ${msgDuration === d.seconds ? styles.msgDurationActive : ''}`}
                        onClick={() => setMsgDuration(d.seconds)}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>

                  <label className={styles.msgSendAllLabel}>
                    <input
                      type="checkbox"
                      className={styles.msgSendAllCheck}
                      checked={!!sendToAll}
                      onChange={e => setSendToAll(e.target.checked)}
                    />
                    Send to all users
                  </label>

                  <button
                    className={styles.msgPostBtn}
                    onClick={postMessage}
                    disabled={!msgText.trim()}
                  >
                    Post
                  </button>
                </div>
              </>
            )}

            {/* ── In-queue tab ── */}
            {msgTab === 'queue' && (
              <>
                <div className={styles.msgTemplates}>
                  {QUEUE_TEMPLATES.map(t => (
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
                  placeholder="Or type a custom announcement…"
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  rows={3}
                  maxLength={120}
                />

                <div className={styles.msgFooter}>
                  <div className={styles.msgDurations}>
                    {QUEUE_DURATIONS.map(d => (
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
                    onClick={addQueueMessage}
                    disabled={!msgText.trim()}
                  >
                    Add to Queue
                  </button>
                </div>
              </>
            )}

            {/* ── Direct message tab ── */}
            {msgTab === 'direct' && (
              <div className={styles.dmPanel}>
                <p className={styles.dmHint}>
                  Send a private message to a specific user. It appears on their app until the timeout or they clear it.
                </p>

                {(!knownAttendees || knownAttendees.length === 0) ? (
                  <p className={styles.empty}>No known attendees yet — they appear here after someone tips.</p>
                ) : (
                  <>
                    <label className={styles.dmLabel}>Recipient</label>
                    <select
                      className={styles.dmSelect}
                      value={dmRecipientId}
                      onChange={e => setDmRecipientId(e.target.value)}
                    >
                      <option value="">— Select attendee —</option>
                      {knownAttendees.map(a => (
                        <option key={a.id} value={a.id}>{a.name || a.email}</option>
                      ))}
                    </select>

                    <label className={styles.dmLabel}>Message</label>
                    <textarea
                      className={styles.msgInput}
                      placeholder="Type a message…"
                      value={dmText}
                      onChange={e => setDmText(e.target.value)}
                      rows={3}
                      maxLength={200}
                    />

                    <label className={styles.dmLabel}>Timeout</label>
                    <div className={styles.msgDurations} style={{ marginBottom: 12 }}>
                      {DM_DURATIONS.map(d => (
                        <button
                          key={d.label}
                          className={`${styles.msgDuration} ${dmDuration === d.seconds ? styles.msgDurationActive : ''}`}
                          onClick={() => setDmDuration(d.seconds)}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>

                    <button
                      className={styles.msgPostBtn}
                      onClick={sendDirect}
                      disabled={!dmRecipientId || !dmText.trim()}
                    >
                      Send Message
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
