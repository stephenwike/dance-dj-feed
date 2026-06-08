import { useState, useEffect } from 'react';
import styles from '../../pages/dj-controller/dj-controller.module.css';

export default function CountdownTimer({ playStartedAt, duration_ms, className }) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    function update() {
      const elapsed = Date.now() - new Date(playStartedAt).getTime();
      setRemaining(Math.max(0, (duration_ms ?? 180000) - elapsed));
    }
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [playStartedAt, duration_ms]);

  if (remaining === null) return null;
  const s = Math.floor(remaining / 1000);
  return (
    <span className={className ?? styles.countdown}>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}
