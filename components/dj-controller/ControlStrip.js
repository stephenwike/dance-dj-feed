import styles from '../../pages/dj-controller/dj-controller.module.css';

export default function ControlStrip({
  activeSession,
  partnerDancesEnabled, togglePartnerDances,
  tippingEnabled, toggleTipping,
  decayEnabled, cycleDecay, currentDecayLabel,
  activeMsg, clearMessage,
  showMessagePanel, msgTab, setShowMessagePanel, setMsgTab, setMsgText, setMsgDuration,
}) {
  if (!activeSession) return null;

  return (
    <div className={styles.controlStrip}>
      {/* Settings section — always kept together */}
      <div className={styles.controlSection}>
        <span className={styles.controlSectionLabel}>Settings</span>
        <button
          className={`${styles.controlToggle} ${partnerDancesEnabled ? styles.controlToggleOn : ''}`}
          onClick={togglePartnerDances}
        >
          👫 Partners {partnerDancesEnabled ? 'On' : 'Off'}
        </button>
        <button
          className={`${styles.controlToggle} ${tippingEnabled ? styles.controlToggleOn : ''}`}
          onClick={toggleTipping}
        >
          💰 Tipping {tippingEnabled ? 'On' : 'Off'}
        </button>
        <button
          className={`${styles.controlToggle} ${decayEnabled ? styles.controlToggleOn : ''}`}
          onClick={cycleDecay}
        >
          ⏱ {currentDecayLabel}
        </button>
      </div>

      <span className={styles.controlDivider} />

      {/* Messages section — always kept together */}
      <div className={styles.controlSection}>
        <span className={styles.controlSectionLabel}>Messages</span>
        {activeMsg && (
          <div className={styles.activeMsgChip}>
            <span className={styles.activeMsgText}>{activeMsg.text}</span>
            <button className={styles.activeMsgClear} onClick={clearMessage}>×</button>
          </div>
        )}
        <button
          className={`${styles.controlToggle} ${showMessagePanel && msgTab === 'urgent' ? styles.controlToggleMsgOn : ''}`}
          onClick={() => {
            if (showMessagePanel && msgTab === 'urgent') { setShowMessagePanel(false); }
            else { setMsgTab('urgent'); setShowMessagePanel(true); setMsgText(''); setMsgDuration(180); }
          }}
        >
          📢 Urgent
        </button>
        <button
          className={`${styles.controlToggle} ${showMessagePanel && msgTab === 'queue' ? styles.controlToggleMsgOn : ''}`}
          onClick={() => {
            if (showMessagePanel && msgTab === 'queue') { setShowMessagePanel(false); }
            else { setMsgTab('queue'); setShowMessagePanel(true); setMsgText(''); setMsgDuration(180); }
          }}
        >
          💬 In-queue
        </button>
      </div>
    </div>
  );
}
