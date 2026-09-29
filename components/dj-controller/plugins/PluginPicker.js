import styles from '../../../pages/dj-controller/dj-controller.module.css';
import { PLUGIN_LIST, getPlugin } from './registry';

/**
 * Settings row for choosing the session's playback plugin.
 *
 * Locked while a track is playing: the playing track is stamped with the old
 * plugin's adapter, so switching mid-track would leave nothing advancing it.
 */
export default function PluginPicker({ pluginId, onSelect, locked }) {
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
          {PLUGIN_LIST.map(p => (
            <button
              key={p.id}
              className={`${styles.countChip} ${p === active ? styles.countChipActive : ''}`}
              onClick={() => onSelect(p.id)}
              disabled={locked || p === active}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
