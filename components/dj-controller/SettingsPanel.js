import styles from '../../pages/dj-controller/dj-controller.module.css';

export default function SettingsPanel({
  activeSession,
  partnerDancesEnabled, togglePartnerDances,
  tippingEnabled, toggleTipping,
  fairnessScoringEnabled, toggleWeighting,
  cycleDecay, decayLabel,
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
          </>
        )}
      </div>
    </div>
  );
}
