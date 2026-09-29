import styles from '../../../../pages/dj-controller/dj-controller.module.css';
import s from './LocalFiles.module.css';

const TITLES = {
  ready: 'Music folder connected',
  'needs-permission': 'Music folder needs permission — see the queue panel',
  'no-folder': 'No music folder chosen — see the queue panel',
  unsupported: 'Local files need Chrome or Edge',
  loading: 'Loading music library',
};

/** SIDEBAR_STATUS slot: is the music folder usable? */
export default function LocalFilesSidebarStatus({ runtime }) {
  const { status } = runtime.library;
  const ready = status === 'ready';
  return (
    <div className={styles.sidebarBtn} title={TITLES[status]}>
      <span className={`${styles.sidebarIcon} ${ready ? s.sidebarReady : s.sidebarAttention}`}>{ready ? '●' : '○'}</span>
      <span className={styles.sidebarLabel}>Music</span>
    </div>
  );
}
