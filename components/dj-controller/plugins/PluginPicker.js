import styles from '../../../pages/dj-controller/dj-controller.module.css';
import { getPlugin } from './registry';
import { MUSIC_SOURCES } from '../../../lib/dj/musicSources';
import { addOnFor, sessionHasPlugin } from '../../../lib/dj/sessionAddOns';
import { PAYMENTS_ENABLED } from '../../../lib/client/dj/useGoLive';

/**
 * Settings row for choosing the session's music source (playback plugin).
 *
 * Included sources switch at once. A paid source the session hasn't bought
 * shows its price and calls `onBuy(pluginId)` instead (see AddOnDialog);
 * once bought it switches freely for the rest of the session. Coming-soon
 * sources are listed but disabled (a session already on one keeps it).
 *
 * Locked while a track is playing: the playing track is stamped with the old
 * plugin's adapter, so switching mid-track would leave nothing advancing it.
 */
export default function PluginPicker({ pluginId, onSelect, onBuy, session, locked }) {
  const active = getPlugin(pluginId);
  return (
    <>
      <div className={`${styles.settingRow} ${styles.settingRowNoBottom}`}>
        <div className={styles.settingInfo}>
          <span className={styles.settingName}>Music Source</span>
          <span className={styles.settingDesc}>
            {locked ? 'Stop the playing track to change the music source' : active.description}
          </span>
        </div>
      </div>
      <div className={styles.settingSubRowPurple}>
        <div className={styles.settingCountChips}>
          {MUSIC_SOURCES.map(src => {
            const isActive = src.id === active.id;
            const owned = sessionHasPlugin(session, src.id);
            const addOn = owned ? null : addOnFor(src.id);
            return (
              <button
                key={src.id}
                className={`${styles.countChip} ${isActive ? styles.countChipActive : ''}`}
                onClick={() => (owned ? onSelect(src.id) : onBuy(src.id))}
                disabled={locked || isActive || src.comingSoon}
                title={src.comingSoon ? `${src.label} is coming soon` : addOn ? `${src.label} is an add-on for this event` : undefined}
              >
                {src.label}
                {src.comingSoon && !isActive ? ' · Coming soon'
                  : addOn && PAYMENTS_ENABLED ? ` · $${(addOn.priceCents / 100).toFixed(2)}` : ''}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
