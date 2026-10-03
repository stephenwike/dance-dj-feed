import { useState } from 'react';
import s from './LocalFiles.module.css';

/**
 * OVERLAY slot: explains that local files need Chrome or Edge.
 *
 * Only Chromium browsers can read a music folder, but the controller is also
 * used as a remote (e.g. Safari on a phone) while a laptop plays the music,
 * so the DJ can dismiss this and carry on.
 */
export default function UnsupportedBrowser({ runtime, controller }) {
  const [dismissed, setDismissed] = useState(false);
  if (runtime.library.status !== 'unsupported' || dismissed) return null;

  return (
    <div className={s.overlay} role="dialog" aria-labelledby="local-files-unsupported">
      <div className={s.overlayCard}>
        <span className={s.overlayIcon}>💻</span>
        <h2 id="local-files-unsupported" className={s.overlayTitle}>Use Chrome or Edge to play local music</h2>
        <p className={s.overlayText}>
          This session plays music from a folder on your computer. Only Google Chrome and
          Microsoft Edge let a web page read your music files, so open this controller in one
          of those on the computer connected to the speakers.
        </p>
        <p className={s.overlayText}>
          Already playing from another computer? You can keep using this device as a remote.
        </p>
        <div className={s.overlayActions}>
          <button className={s.primaryBtn} onClick={() => setDismissed(true)}>Use as a remote</button>
          {/* Same rule as the Settings picker: never switch plugin mid-track. */}
          {controller.playing.length === 0 && (
            <button className={s.ghostBtn} onClick={() => controller.setPlugin('standard')}>Switch session to Standard</button>
          )}
        </div>
      </div>
    </div>
  );
}
