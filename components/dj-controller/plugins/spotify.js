import styles from '../../../pages/dj-controller/dj-controller.module.css';
import { SpotifyAdapter } from '../../../lib/client/dj/controllerAdapters';
import { useSpotifyPlugin } from '../../../lib/client/dj/plugins/useSpotifyPlugin';
import { SpotifyPanel, SpotifySearch } from '../SpotifyComponents';
import { musicSource } from '../../../lib/dj/musicSources';

/** Spotify transport, Start Queue, and the now-playing card. */
function SpotifyPlayer({ runtime, controller }) {
  const { playing, queue, onAction } = controller;
  return (
    <>
      <SpotifyPanel
        data={runtime.data}
        onControl={runtime.handleControl}
        connected={runtime.connected}
        error={runtime.error}
        onRetry={runtime.retry}
      />

      {playing.length === 0 && queue.length > 0 && (
        <button className={styles.remoteBtnStart} onClick={() => onAction(queue[0]._id, 'startQueue')}>
          ▶ Start Queue
        </button>
      )}

      {playing.map(r => (
        <div key={r._id} className={styles.qCard} style={{ borderColor: 'rgba(138,92,255,0.4)' }}>
          <div className={styles.qInfo}>
            <div className={styles.qName}>{r.danceName} <span className={styles.nowBadge}>NOW PLAYING</span></div>
            {r.songName && <div className={styles.qSong}>{r.songName}{r.artist ? ` — ${r.artist}` : ''}</div>}
          </div>
          <div className={styles.qActions}>
            <button className={styles.btnPlayed} onClick={() => onAction(r._id, 'played')}>✓ Played</button>
            <button className={styles.btnRemove} onClick={() => onAction(r._id, 'remove')}>✕</button>
          </div>
        </div>
      ))}

      {playing.length === 0 && queue.length === 0 && (
        <p className={styles.empty}>Queue is empty.</p>
      )}
    </>
  );
}

function SpotifyQueueFooter({ runtime, controller }) {
  return <SpotifySearch onAdd={(track) => runtime.handleAdd(track, controller.nextQueuePos)} />;
}

function SpotifySidebarStatus({ runtime }) {
  return runtime.connected
    ? <div className={`${styles.sidebarBtn} ${styles.sidebarBtnSpotify}`} title="Spotify connected">
        <span className={styles.sidebarIcon}>●</span>
        <span className={styles.sidebarLabel}>Spotify</span>
      </div>
    : <a href="/api/spotify/auth" className={`${styles.sidebarBtn} ${styles.sidebarBtnSpotifyOff}`} title="Connect Spotify">
        <span className={styles.sidebarIcon}>○</span>
        <span className={styles.sidebarLabel}>Spotify</span>
      </a>;
}

export default {
  id: 'spotify',
  label: musicSource('spotify').label,
  description: musicSource('spotify').description,
  adapter: SpotifyAdapter,
  useRuntime: useSpotifyPlugin,
  slots: {
    player: SpotifyPlayer,
    queueFooter: SpotifyQueueFooter,
    sidebarStatus: SpotifySidebarStatus,
  },
};
