import styles from '../../pages/dj-controller/dj-controller.module.css';

const QUEUE_COUNT_OPTIONS = [
  { label: '2', value: 2 },
  { label: '4', value: 4 },
  { label: '8', value: 8 },
  { label: 'All', value: 0 },
];

export default function SettingsPanel({
  activeSession,
  requestsEnabled, toggleRequestsEnabled,
  partnerDancesEnabled, togglePartnerDances,
  tippingEnabled, toggleTipping,
  fairnessScoringEnabled, toggleWeighting,
  cycleDecay, decayLabel,
  queueVisibleToRequesters, toggleQueueVisibility,
  queueVisibleCount, setQueueVisibleCount,
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Session Settings</span>
      </div>
      <div className={styles.panelBody}>
        {!activeSession ? (
          <p className={styles.empty}>Start a session to configure settings.</p>
        ) : (
          <>
            <div className={styles.settingRow}>
              <div className={styles.settingInfo}>
                <span className={styles.settingName}>Accept Requests</span>
                <span className={styles.settingDesc}>Allow attendees to submit dance requests</span>
              </div>
              <button
                className={`${styles.toggle} ${requestsEnabled ? styles.toggleOn : ''}`}
                onClick={toggleRequestsEnabled}
                aria-label={`Requests ${requestsEnabled ? 'on' : 'off'}`}
              />
            </div>

            <div className={styles.settingRow}>
              <div className={styles.settingInfo}>
                <span className={styles.settingName}>Partner Dances</span>
                <span className={styles.settingDesc}>Show partner dance requests alongside line dances</span>
              </div>
              <button
                className={`${styles.toggle} ${partnerDancesEnabled ? styles.toggleOn : ''}`}
                onClick={togglePartnerDances}
                aria-label={`Partner dances ${partnerDancesEnabled ? 'on' : 'off'}`}
              />
            </div>

            <div className={styles.settingRow}>
              <div className={styles.settingInfo}>
                <span className={styles.settingName}>Beat Tipping</span>
                <span className={styles.settingDesc}>Let attendees tip on requests with no processing fee</span>
              </div>
              <button
                className={`${styles.toggle} ${tippingEnabled ? styles.toggleOn : ''}`}
                onClick={toggleTipping}
                aria-label={`Tipping ${tippingEnabled ? 'on' : 'off'}`}
              />
            </div>

            <div className={`${styles.settingRow} ${fairnessScoringEnabled ? styles.settingRowNoBottom : ''}`}>
              <div className={styles.settingInfo}>
                <span className={styles.settingName}>Request Weighting</span>
                <span className={styles.settingDesc}>Balance requests so regulars don&apos;t crowd out newcomers</span>
              </div>
              <button className={styles.cycleBtn} onClick={toggleWeighting}>
                {fairnessScoringEnabled ? 'Balanced' : 'None'}
              </button>
            </div>

            {fairnessScoringEnabled && (
              <div className={styles.settingSubRow}>
                <span className={styles.settingSubName}>Weight Decay</span>
                <button className={styles.cycleBtn} onClick={cycleDecay}>
                  {decayLabel}
                </button>
              </div>
            )}

            <div className={`${styles.settingRow} ${queueVisibleToRequesters ? styles.settingRowNoBottom : ''}`}>
              <div className={styles.settingInfo}>
                <span className={styles.settingName}>Queue Visible to Attendees</span>
                <span className={styles.settingDesc}>Let attendees see the upcoming dance queue in the request app</span>
              </div>
              <button
                className={`${styles.toggle} ${queueVisibleToRequesters ? styles.toggleOn : ''}`}
                onClick={toggleQueueVisibility}
                aria-label={`Queue visibility ${queueVisibleToRequesters ? 'on' : 'off'}`}
              />
            </div>

            {queueVisibleToRequesters && (
              <div className={styles.settingSubRowPurple}>
                <span className={styles.settingSubName} style={{ color: 'rgba(180,160,255,0.6)' }}>Items shown</span>
                <div className={styles.settingCountChips}>
                  {QUEUE_COUNT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      className={`${styles.countChip} ${queueVisibleCount === opt.value ? styles.countChipActive : ''}`}
                      onClick={() => setQueueVisibleCount(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
