import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useController } from '../../components/dj-controller/useController';
import DesktopController from '../../components/dj-controller/DesktopController';
import MobileController from '../../components/dj-controller/mobile/MobileController';
import ControllerOverlays from '../../components/dj-controller/ControllerOverlays';
import styles from './dj-controller.module.css';

// Screens this narrow get the phone layout (unless the host chose otherwise).
const NARROW_QUERY = '(max-width: 768px)';
// The host's choice, remembered on this device: 'phone' | 'desktop' (absent = automatic).
const LAYOUT_KEY = 'dj-controller:layout';

function readChoice() {
  try { return localStorage.getItem(LAYOUT_KEY); } catch { return null; }
}
function writeChoice(choice) {
  try {
    if (choice) localStorage.setItem(LAYOUT_KEY, choice);
    else localStorage.removeItem(LAYOUT_KEY);
  } catch { /* storage unavailable — the choice just isn't remembered */ }
}

/** Which layout to show; null until known (avoids flashing the wrong one). */
function useControllerLayout() {
  const [isNarrow, setIsNarrow] = useState(null);
  const [choice, setChoice] = useState(null);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const update = () => setIsNarrow(mq.matches);
    update();
    setChoice(readChoice());
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const automatic = isNarrow ? 'phone' : 'desktop';
  const layout = isNarrow === null ? null : (choice ?? automatic);
  // Choosing what the screen would get anyway clears the override.
  const choose = next => {
    const stored = next === automatic ? null : next;
    setChoice(stored);
    writeChoice(stored);
  };
  return { layout, isNarrow, choose };
}

function Controller() {
  const ctl = useController();
  const { layout, isNarrow, choose } = useControllerLayout();
  if (!layout) return null;
  return (
    <>
      {layout === 'phone'
        ? <MobileController ctl={ctl} onUseDesktop={() => choose('desktop')} />
        : <DesktopController ctl={ctl} />}
      {layout === 'desktop' && isNarrow && (
        <button className={styles.usePhoneLayout} onClick={() => choose('phone')}>📱 Phone layout</button>
      )}
      <ControllerOverlays ctl={ctl} />
    </>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────
export default function DJControllerPage() {
  return (
    <>
      <Head>
        <title>DJ Controller</title>
        {/* Fill notched phone screens; the phone layout pads for safe areas. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <Controller />
    </>
  );
}
